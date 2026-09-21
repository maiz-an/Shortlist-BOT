import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_PROVIDER, AIProvider, AIUnavailableError } from '../ai/ai-provider';
import { InvalidAIOutputError, parseAIOutput } from '../ai/json-output';
import { ANGLE_SYSTEM, AnglePromptInput, buildAnglePrompt } from '../ai/prompts/email-angle.prompt';
import { buildEmailPrompt, EMAIL_SYSTEM } from '../ai/prompts/email-generation.prompt';
import { angleSchema, EmailAngle, EmailOutput, emailSchema } from '../ai/schemas';
import { ApplicationsService } from '../applications/applications.service';
import { SettingsService } from '../settings/settings.service';
import { parseRequiredYears } from '../job-analysis/scoring';
import { cvFacts } from '../cv-profiles/cv-text';
import { buildFallbackEmail, cleanEmailText, draftProblems, employerFor, experienceAnchors, findForbiddenClaims, findOverclaims, findUngrounded, findUngroundedNumbers, formatEmail, gapNote, mostlyIn, pickCloser, pickOpener } from './email-draft';

/** Generates a validated email; retries once when the body claims skills the CV lacks. Exported for tests. */
export async function generateEmail(
  ai: AIProvider,
  prompt: string,
  forbidden: string[],
  /** Everything the email may name: CV text, CV skills, the job title and company. */
  groundTruth = '',
  /** Real employers/projects from the CV; the email must name at least one so its claims stay tied to the CV. */
  anchors: string[] = [],
  /** Blocks leadership/seniority wording the CV does not use ("managed", "led", "senior"). */
  overclaim?: { cvText: string; jobTitle: string },
  /** Told why each draft was rejected (for the log). */
  onReject?: (reason: string) => void,
): Promise<EmailOutput> {
  let problem = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await ai.generate(attempt ? `${prompt}\n\nFix this problem from your previous attempt: ${problem}` : prompt, {
      system: EMAIL_SYSTEM, json: true, temperature: 0.5,
    });
    try {
      const out = parseAIOutput(raw, emailSchema);
      const body = cleanEmailText(out.body);
      // The job's own title is quoted in the email and is not a claim about the candidate.
      const claimText = `${out.subject}\n${body}`;
      const claims = findForbiddenClaims(overclaim?.jobTitle ? claimText.split(overclaim.jobTitle).join(' ') : claimText, forbidden);
      const invented = groundTruth ? findUngrounded(`${out.subject}\n${body}`, groundTruth) : [];
      const madeUpNumbers = groundTruth ? findUngroundedNumbers(body, groundTruth) : [];
      const unanchored = anchors.length > 0 && !anchors.some((a) => body.toLowerCase().includes(a));
      const inflated = overclaim ? findOverclaims(body, overclaim.cvText, overclaim.jobTitle) : [];
      const style = draftProblems(body);
      if (!claims.length && !invented.length && !madeUpNumbers.length && !unanchored && !inflated.length && !style) return { subject: cleanEmailText(out.subject).replace(/\n/g, ' '), body: formatEmail(body) };
      problem = claims.length
        ? `The email claims skills the candidate does not have: ${claims.join(', ')}. Remove them.`
        : madeUpNumbers.length
          ? `These figures are not on the candidate's CV: ${madeUpNumbers.join(', ')}. Remove them.`
        : invented.length
          ? `These terms are not on the candidate's CV, so you must not use them: ${invented.join(', ')}. Only describe work that is written in the CV work experience.`
          : inflated.length
            ? `You wrote ${inflated.map((w) => `"${w}"`).join(', ')}, which makes the candidate sound more senior than the CV says. Use plain words such as worked on, built, supported or took part in.`
          : unanchored
            ? `Name at least one real employer or project from the CV work experience (for example ${anchors.slice(0, 3).join(', ')}) and describe only what is written there.`
            : `Rewrite it: ${style}.`;
      onReject?.(problem);
    } catch (err) {
      if (!(err instanceof InvalidAIOutputError)) throw err;
      problem = err.message;
    }
  }
  throw new InvalidAIOutputError(problem, '');
}

/**
 * Step 1 of writing an email: the single best honest link between the ad and the CV.
 * The quoted CV evidence must really come from the CV, otherwise it is discarded (returns null).
 */
export async function findAngle(ai: AIProvider, input: AnglePromptInput): Promise<EmailAngle | null> {
  const prompt = buildAnglePrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ai.generate(prompt, { system: ANGLE_SYSTEM, json: true, temperature: 0.1 });
    try {
      const a = parseAIOutput(raw, angleSchema);
      if (mostlyIn(a.evidence, `${input.cvExperience} ${input.cvSkills.join(' ')}`)) return a;
    } catch (err) {
      if (!(err instanceof InvalidAIOutputError)) throw err;
    }
  }
  return null;
}

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AIProvider,
    private readonly settings: SettingsService,
    private readonly apps: ApplicationsService,
  ) {}

  async generate(applicationId: string) {
    const app = await this.apps.get(applicationId);
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: app.jobId }, include: { analysis: true } });
    const cvId = app.selectedCv?.id ?? job.analysis?.recommendedCvId;
    if (!cvId) throw new BadRequestException('No CV selected. Enable a CV profile or choose one first.');
    const cv = await this.prisma.cVProfile.findUniqueOrThrow({ where: { id: cvId } });
    const candidate = await this.settings.get('candidate');
    // Experience, summary and years come from the CV file itself; Settings only supplies name and phone.
    const facts = cvFacts(cv.textContent ?? '');
    const years = cv.experienceYears ?? facts.years;

    const matched = job.analysis?.matchedSkills ?? [];
    const forbidden = job.analysis?.missingSkills ?? [];
    let email: { subject: string; body: string };
    let generatedBy: 'ai' | 'template' = 'ai';
    let angle: EmailAngle | null = null;
    try {
      // With no readable CV text the model would have nothing true to write from, so it must not be asked to.
      if (!facts.experience) throw new InvalidAIOutputError('The selected CV has no readable experience text.', '');
      const cvText = cv.textContent ?? '';
      angle = await findAngle(this.ai, {
        jobTitle: job.title, company: job.company, description: job.description || '(no description available)',
        cvExperience: facts.experience, cvSkills: cv.skills,
      });
      // The seniority gap is worked out from numbers here, so the email is honest about it without guessing.
      const requiredYears = parseRequiredYears(`${job.analysis?.experienceRequired ?? ''} experience ${job.description ?? ''}`);
      const prompt = buildEmailPrompt({
        jobTitle: job.title, company: job.company, description: job.description || '(no description available)',
        cv: { name: cv.name, skills: cv.skills, years, summary: facts.summary, experience: facts.experience },
        candidate: { name: candidate.name, phone: candidate.phone }, matchedSkills: matched, forbiddenSkills: forbidden,
        angle, gap: gapNote(requiredYears, years, job.id), closer: pickCloser(job.id), opener: pickOpener(job.id),
        employer: angle ? employerFor(facts.experience, angle.evidence) : null,
      });
      email = await generateEmail(
        this.ai, prompt, forbidden,
        [cvText, cv.skills.join(' '), job.title, job.company, candidate.name, String(years ?? ''), String(requiredYears ?? '')].join('\n'),
        experienceAnchors(facts.experience),
        { cvText: `${cvText} ${cv.skills.join(' ')}`, jobTitle: job.title },
        (reason) => this.logger.log({ event: 'email.draft_rejected', applicationId, reason }),
      );
    } catch (err) {
      if (!(err instanceof AIUnavailableError) && !(err instanceof InvalidAIOutputError)) throw err;
      this.logger.warn({ event: 'email.fallback_template', reason: (err as Error).message });
      generatedBy = 'template';
      email = buildFallbackEmail({
        jobTitle: job.title, company: job.company, candidateName: candidate.name, cvName: cv.name,
        matchedSkills: matched, yearsExperience: years,
        evidence: angle ? { employer: employerFor(facts.experience, angle.evidence) ?? '', line: angle.evidence } : null,
      });
    }

    const recipient = job.applicationEmail ?? undefined;
    const existing = await this.prisma.emailDraft.findUnique({ where: { applicationId } });
    const draft = await this.prisma.emailDraft.upsert({
      where: { applicationId },
      update: { subject: email.subject, body: email.body, recipient: existing?.recipient ?? recipient },
      create: { applicationId, subject: email.subject, body: email.body, recipient },
    });
    if (!app.selectedCv) await this.apps.update(applicationId, { selectedCvId: cvId });
    return { draft, generatedBy, fit: angle?.fit ?? null };
  }
}
