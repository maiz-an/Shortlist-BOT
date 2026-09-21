import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { toPlainText } from '../../common/utils/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { CvProfilesService, MIME } from '../cv-profiles/cv-profiles.service';
import { EMAIL_RE } from './email-draft';
import { EMAIL_PROVIDER, EmailAuthError, EmailProvider, EmailSendError } from './email-provider';

export interface SendInput {
  confirm: boolean;
  recipient?: string;
  subject?: string;
  body?: string;
}

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly apps: ApplicationsService,
    private readonly cvs: CvProfilesService,
  ) {}

  async saveDraft(applicationId: string, d: { recipient?: string; subject?: string; body?: string }) {
    await this.apps.get(applicationId);
    const data = {
      ...(d.recipient !== undefined ? { recipient: d.recipient.trim() || null } : {}),
      ...(d.subject !== undefined ? { subject: toPlainText(d.subject).replace(/\n/g, ' ') } : {}),
      ...(d.body !== undefined ? { body: toPlainText(d.body) } : {}),
    };
    return this.prisma.emailDraft.upsert({
      where: { applicationId },
      update: data,
      create: { applicationId, subject: data.subject ?? '', body: data.body ?? '', recipient: data.recipient ?? null },
    });
  }

  async send(applicationId: string, input: SendInput) {
    if (!input.confirm) throw new BadRequestException('Sending must be explicitly confirmed');
    let app = await this.apps.get(applicationId);
    if (app.status === 'APPLIED') throw new ConflictException('This application was already sent');
    if (app.status === 'SENDING') throw new ConflictException('This application is already being sent');

    const draft = await this.saveDraft(applicationId, input);
    const to = draft.recipient?.trim() ?? '';
    if (!EMAIL_RE.test(to)) throw new BadRequestException('A valid recipient email is required');
    if (!draft.subject.trim() || !draft.body.trim()) throw new BadRequestException('Subject and body are required');

    if (!app.selectedCv) throw new BadRequestException('No CV selected for this application');
    const cvPath = await this.cvs.resolveFile(app.selectedCv);
    if (!cvPath) throw new BadRequestException(`CV file for "${app.selectedCv.name}" is missing. Upload it on the CVs page.`);

    const status = await this.email.status();
    if (!status.connected) throw new ConflictException('Gmail is not connected. Connect it on the Email page.');

    const before = app.status;
    if (before !== 'APPROVED') await this.apps.setStatus(app.jobId, 'APPROVED', { note: 'Approved for sending' });
    await this.apps.setStatus(app.jobId, 'SENDING');

    try {
      const ext = path.extname(cvPath).toLowerCase();
      const sent = await this.email.send({
        to, subject: draft.subject, body: draft.body,
        attachments: [{ filename: app.selectedCv.originalFileName ?? path.basename(cvPath), path: cvPath, contentType: MIME[ext] }],
      });
      const message = await this.prisma.emailMessage.create({
        data: {
          applicationId, recipient: to, subject: draft.subject, body: draft.body,
          selectedCvPath: app.selectedCv.originalFileName ?? path.basename(cvPath), provider: 'GMAIL', providerMessageId: sent.messageId,
        },
      });
      await this.apps.setStatus(app.jobId, 'APPLIED', { note: `Sent to ${to}` });
      this.logger.log({ event: 'email.sent', applicationId, provider: 'GMAIL' });
      return message;
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error({ event: 'email.send_failed', applicationId, kind: (err as Error).name, error: reason });
      await this.apps.setStatus(app.jobId, 'APPROVED', { note: `Send failed: ${reason}`.slice(0, 300) }).catch(() => undefined);
      if (err instanceof EmailAuthError) throw new ConflictException(reason);
      if (err instanceof EmailSendError) throw new BadGatewayException(reason);
      throw new BadGatewayException('Sending failed unexpectedly');
    }
  }
}
