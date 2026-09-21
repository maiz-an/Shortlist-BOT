import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_PROVIDER, AIProvider, AIUnavailableError } from '../ai/ai-provider';
import { InvalidAIOutputError, parseAIOutput } from '../ai/json-output';
import { buildEmailPrompt, EMAIL_SYSTEM } from '../ai/prompts/email-generation.prompt';
import { EmailOutput, emailSchema } from '../ai/schemas';
import { ApplicationsService } from '../applications/applications.service';
import { SettingsService } from '../settings/settings.service';
import { buildFallbackEmail, cleanEmailText, findForbiddenClaims } from './email-draft';

/** Generates a validated email; retries once when the body claims skills the CV lacks. Exported for tests. */
export async function generateEmail(
  ai: AIProvider,
  prompt: string,
  forbidden: string[],
): Promise<EmailOutput> {
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ai.generate(attempt ? `${prompt}\n\nFix this problem from your previous attempt: ${problem}` : prompt, {
      system: EMAIL_SYSTEM, json: true, temperature: 0.4,
    });
    try {
      const out = parseAIOutput(raw, emailSchema);
      const body = cleanEmailText(out.body);
      const claims = findForbiddenClaims(`${out.subject}\n${body}`, forbidden);
      if (!claims.length) return { subject: cleanEmailText(out.subject).replace(/\n/g, ' '), body };
      problem = `The email claims skills the candidate does not have: ${claims.join(', ')}. Remove them.`;
    } catch (err) {
      if (!(err instanceof InvalidAIOutputError)) throw err;
      problem = err.message;
    }
  }
  throw new InvalidAIOutputError(problem, '');
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

    const matched = job.analysis?.matchedSkills ?? [];
    const forbidden = job.analysis?.missingSkills ?? [];
    const prompt = buildEmailPrompt({
      jobTitle: job.title, company: job.company, description: job.description || '(no description available)',
      cv: { name: cv.name, skills: cv.skills }, candidate, matchedSkills: matched, forbiddenSkills: forbidden,
    });

    let email: { subject: string; body: string };
    let generatedBy: 'ai' | 'template' = 'ai';
    try {
      email = await generateEmail(this.ai, prompt, forbidden);
    } catch (err) {
      if (!(err instanceof AIUnavailableError) && !(err instanceof InvalidAIOutputError)) throw err;
      this.logger.warn({ event: 'email.fallback_template', reason: (err as Error).message });
      generatedBy = 'template';
      email = buildFallbackEmail({
        jobTitle: job.title, company: job.company, candidateName: candidate.name, cvName: cv.name,
        matchedSkills: matched, yearsExperience: candidate.yearsExperience,
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
    return { draft, generatedBy };
  }
}
