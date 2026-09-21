export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  attachments: { filename: string; path: string; contentType?: string }[];
}

export interface ConnectionStatus {
  connected: boolean;
  email?: string;
  configured: boolean;
  detail?: string;
}

export class EmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailAuthError';
  }
}

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/** Provider-agnostic mail interface. GmailProvider is the only V1 implementation. */
export interface EmailProvider {
  readonly type: 'GMAIL';
  status(): Promise<ConnectionStatus>;
  authUrl(): string;
  handleCallback(code: string, state: string): Promise<{ email: string }>;
  disconnect(): Promise<void>;
  send(mail: OutgoingEmail): Promise<{ messageId?: string; from: string }>;
}
