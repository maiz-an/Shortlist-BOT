import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import MailComposer from 'nodemailer/lib/mail-composer';
import { decrypt, encrypt } from '../../common/utils/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectionStatus, EmailAuthError, EmailProvider, EmailSendError, OutgoingEmail } from './email-provider';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

/** Gmail via OAuth 2.0 (authorization-code flow). No password is ever requested or stored; tokens are AES-GCM encrypted. */
@Injectable()
export class GmailProvider implements EmailProvider {
  readonly type = 'GMAIL' as const;
  private readonly logger = new Logger(GmailProvider.name);
  private readonly states = new Map<string, number>();

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private get clientId() { return this.config.get<string>('GMAIL_CLIENT_ID', ''); }
  private get clientSecret() { return this.config.get<string>('GMAIL_CLIENT_SECRET', ''); }
  private get redirectUri() { return this.config.get<string>('GMAIL_REDIRECT_URI', 'http://localhost:4000/api/email/oauth/callback'); }
  private get secret() {
    const s = this.config.get<string>('TOKEN_ENCRYPTION_KEY', '');
    if (!s) throw new EmailAuthError('TOKEN_ENCRYPTION_KEY is not set in the backend .env');
    return s;
  }

  private account() {
    return this.prisma.emailAccount.findFirst({ where: { provider: 'GMAIL' }, orderBy: { updatedAt: 'desc' } });
  }

  async status(): Promise<ConnectionStatus> {
    const configured = !!(this.clientId && this.clientSecret);
    const acc = await this.account();
    return {
      configured, connected: !!acc?.encryptedRefreshToken, email: acc?.emailAddress,
      detail: configured ? undefined : 'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in backend/.env',
    };
  }

  authUrl(): string {
    if (!this.clientId || !this.clientSecret) throw new EmailAuthError('Gmail OAuth client is not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET)');
    const now = Date.now();
    for (const [k, t] of this.states) if (now - t > 600_000) this.states.delete(k);
    const state = randomBytes(24).toString('base64url');
    this.states.set(state, now);
    const p = new URLSearchParams({
      client_id: this.clientId, redirect_uri: this.redirectUri, response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'consent', state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  async handleCallback(code: string, state: string) {
    if (!this.states.delete(state)) throw new EmailAuthError('Invalid or expired OAuth state');
    const tok = await this.tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: this.redirectUri });
    if (!tok.refresh_token) throw new EmailAuthError('Google did not return a refresh token; remove app access in your Google account and retry');
    const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json() as { email?: string };
    if (!info.email) throw new EmailAuthError('Could not determine Gmail address');
    const data = {
      encryptedAccessToken: encrypt(tok.access_token, this.secret),
      encryptedRefreshToken: encrypt(tok.refresh_token, this.secret),
      tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
    };
    await this.prisma.emailAccount.upsert({
      where: { provider_emailAddress: { provider: 'GMAIL', emailAddress: info.email } },
      update: data,
      create: { provider: 'GMAIL', emailAddress: info.email, ...data },
    });
    this.logger.log({ event: 'gmail.connected' });
    return { email: info.email };
  }

  async disconnect() {
    await this.prisma.emailAccount.deleteMany({ where: { provider: 'GMAIL' } });
  }

  private async tokenRequest(params: Record<string, string>) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...params }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token: string; refresh_token?: string; expires_in: number; error?: string };
    if (!res.ok) throw new EmailAuthError(`Gmail authentication failed (${json.error ?? res.status}). Reconnect your account.`);
    return json;
  }

  private async accessToken(): Promise<{ token: string; email: string }> {
    const acc = await this.account();
    if (!acc?.encryptedRefreshToken) throw new EmailAuthError('Gmail is not connected');
    if (acc.encryptedAccessToken && acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() - Date.now() > 60_000) {
      return { token: decrypt(acc.encryptedAccessToken, this.secret), email: acc.emailAddress };
    }
    const tok = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(acc.encryptedRefreshToken, this.secret) });
    await this.prisma.emailAccount.update({
      where: { id: acc.id },
      data: { encryptedAccessToken: encrypt(tok.access_token, this.secret), tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000) },
    });
    return { token: tok.access_token, email: acc.emailAddress };
  }

  async send(mail: OutgoingEmail) {
    const { token, email } = await this.accessToken();
    const raw: Buffer = await new Promise((resolve, reject) =>
      new MailComposer({ from: email, to: mail.to, subject: mail.subject, text: mail.body, attachments: mail.attachments }).compile().build((e, msg) => (e ? reject(e) : resolve(msg))),
    );
    let res: Response;
    try {
      res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: raw.toString('base64url') }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      throw new EmailSendError(`Could not reach Gmail: ${(err as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new EmailAuthError('Gmail rejected the credentials. Reconnect your account.');
    if (!res.ok) throw new EmailSendError(`Gmail send failed (${res.status})`);
    const json = (await res.json()) as { id?: string };
    return { messageId: json.id, from: email };
  }
}
