import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_PROVIDER, AIProvider } from '../ai/ai-provider';
import { InvalidAIOutputError, parseAIOutput } from '../ai/json-output';
import { buildCvMatchPrompt, CV_MATCH_SYSTEM } from '../ai/prompts/cv-matching.prompt';
import { AnalysisPromptInput, buildJobAnalysisPrompt, JOB_ANALYSIS_SYSTEM } from '../ai/prompts/job-analysis.prompt';
import { cvMatchSchema, JobAnalysisOutput, jobAnalysisSchema } from '../ai/schemas';
import { ApplicationsService } from '../applications/applications.service';
import { SettingsService } from '../settings/settings.service';
import { CvCandidate, selectCv } from './cv-selection';
import { buildReason } from './reason';
import { calculateScore, recommendationFor } from './scoring';

/** Calls the model and strictly validates the result; retries once on malformed output. */
export async function runAiAnalysis(ai: AIProvider, input: AnalysisPromptInput): Promise<JobAnalysisOutput> {
  const prompt = buildJobAnalysisPrompt(input);
  let lastError: InvalidAIOutputError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ai.generate(
      attempt === 0 ? prompt : `${prompt}\n\nYour previous answer was invalid (${lastError?.message}). Return ONLY the JSON object.`,
      { system: JOB_ANALYSIS_SYSTEM, json: true, temperature: 0.1 },
    );
    try {
      return parseAIOutput(raw, jobAnalysisSchema);
    } catch (err) {
      if (!(err instanceof InvalidAIOutputError)) throw err;
      lastError = err;
    }
  }
  throw lastError!;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AIProvider,
    private readonly settings: SettingsService,
    private readonly apps: ApplicationsService,
  ) {}

  /** Full pipeline for one job: AI analysis -> deterministic CV pick + score -> REVIEW if good enough. */
  async analyze(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    // Re-analysis of a job already in review/applied must not reset its workflow status.
    const inPipeline = ['NEW', 'ANALYZING', 'ANALYZED'].includes(job.status);
    if (inPipeline) await this.apps.setStatus(jobId, 'ANALYZING');

    try {
      const [cvRows, profiles, thresholds, pipeline] = await Promise.all([
        this.prisma.cVProfile.findMany({ where: { enabled: true } }),
        this.prisma.jobSearchProfile.findMany({ where: { enabled: true } }),
        this.settings.get('match_score_thresholds'),
        this.settings.get('pipeline'),
      ]);
      const cvs: CvCandidate[] = cvRows.map((c) => ({
        id: c.id, name: c.name, category: c.category, skills: c.skills,
        preferredJobKeywords: c.preferredJobKeywords, excludedKeywords: c.excludedKeywords, years: c.experienceYears,
      }));
      const knownYears = cvs.map((c) => c.years).filter((y): y is number => typeof y === 'number');
      const constraints = {
        excludedKeywords: [...new Set(profiles.flatMap((p) => p.excludedKeywords))],
        preferredJobTypes: [...new Set(profiles.flatMap((p) => p.preferredJobTypes))],
        preferredLocations: [...new Set(profiles.flatMap((p) => p.preferredLocations))],
        keywords: [...new Set(profiles.flatMap((p) => p.keywords))],
      };

      const ai = await runAiAnalysis(this.ai, {
        title: job.title, company: job.company, location: job.location, description: job.description || '(no description available)',
        cvs, candidate: { yearsExperience: knownYears.length ? Math.max(...knownYears) : null, preferredLocations: constraints.preferredLocations },
      });

      const aiCvId = cvs.some((c) => c.id === ai.recommendedCvId) ? ai.recommendedCvId : null; // never trust unknown ids
      const jobText = { title: job.title, description: job.description };
      let pick = selectCv(jobText, cvs, ai.category, aiCvId);
      if (pick.ambiguous) pick = await this.breakTie(jobText, cvs, pick);
      const cv = cvs.find((c) => c.id === pick.cvId) ?? null;

      // Experience is judged from the CV that was picked (its own dates), never from a typed-in number.
      const candidateYears = cv?.years ?? (knownYears.length ? Math.max(...knownYears) : null);
      const result = calculateScore({
        job: { ...jobText, location: job.location, jobType: job.jobType }, cv, constraints,
        ai, candidateYears, cvRelevance: pick.relevance,
      });
      const recommendation = recommendationFor(result.score, thresholds, result.excludedHits, ai);
      const reason = buildReason({
        score: result.score, recommendation, hasCv: !!cv, matched: result.matchedSkills, missing: result.missingSkills,
        requiredYears: result.experienceRequiredYears, candidateYears,
        experienceCompatible: result.experienceCompatible, locationCompatible: result.locationCompatible,
        excludedHits: result.excludedHits, ai: { recommendation: ai.recommendation, matchScore: ai.matchScore, reason: ai.reason },
      });

      const data = {
        category: ai.category, aiMatchScore: ai.matchScore, finalMatchScore: result.score, recommendedCvId: cv?.id ?? null,
        matchedSkills: result.matchedSkills, missingSkills: result.missingSkills, experienceRequired: ai.experienceRequired,
        experienceCompatible: result.experienceCompatible, locationCompatible: result.locationCompatible,
        salaryMentioned: ai.salaryMentioned, applicationMethod: job.applicationEmail ? 'EMAIL' as const : ai.applicationMethod,
        recommendation, reason, rawAiResponse: { ai, breakdown: result.breakdown, ranking: pick.ranking } as unknown as Prisma.InputJsonValue,
      };
      await this.prisma.jobAnalysis.upsert({ where: { jobId }, update: data, create: { jobId, ...data } });
      await this.prisma.job.update({ where: { id: jobId }, data: { analysisError: null } });
      if (inPipeline) await this.apps.setStatus(jobId, 'ANALYZED');

      const minScore = profiles.length ? Math.min(...profiles.map((p) => p.minMatchScore)) : pipeline.defaultMinScore;
      if (inPipeline && result.score >= minScore && recommendation !== 'SKIP') {
        await this.apps.ensureForJob(jobId);
        await this.apps.setStatus(jobId, 'REVIEW');
      }
      this.logger.log({ event: 'analysis.done', jobId, score: result.score, recommendation, cvId: cv?.id ?? null });
      return this.prisma.jobAnalysis.findUnique({ where: { jobId } });
    } catch (err) {
      const message = (err as Error).message.slice(0, 300);
      this.logger.error({ event: 'analysis.failed', jobId, kind: (err as Error).name, error: message });
      await this.prisma.job.update({ where: { id: jobId }, data: { analysisError: message } }).catch(() => undefined);
      if (inPipeline) await this.apps.setStatus(jobId, 'NEW').catch(() => undefined);
      throw err;
    }
  }

  private async breakTie(job: { title: string; description: string }, cvs: CvCandidate[], pick: ReturnType<typeof selectCv>) {
    const top = new Set(pick.ranking.slice(0, 2).map((r) => r.id));
    const options = cvs.filter((c) => top.has(c.id));
    try {
      const raw = await this.ai.generate(buildCvMatchPrompt({ ...job, options }), { system: CV_MATCH_SYSTEM, json: true, temperature: 0 });
      const { cvId } = parseAIOutput(raw, cvMatchSchema);
      if (top.has(cvId)) return { ...pick, cvId, ambiguous: false };
    } catch (err) {
      this.logger.warn({ event: 'cv_tiebreak.failed', error: (err as Error).message });
    }
    return pick;
  }
}
