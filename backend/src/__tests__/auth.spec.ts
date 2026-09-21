import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService, readCookie, signSession, verifySession } from '../modules/auth/auth.module';

const cfg = (values: Record<string, string>) => ({ get: (k: string, d?: string) => values[k] ?? d }) as unknown as ConfigService;

describe('session tokens', () => {
  it('verifies a fresh token and rejects tampered, expired and empty ones', () => {
    const t = signSession('secret', 1000, 5000);
    expect(verifySession('secret', t, 2000)).toBe(true);
    expect(verifySession('other', t, 2000)).toBe(false);
    expect(verifySession('secret', t, 7000)).toBe(false); // expired
    expect(verifySession('secret', `9999999999999.${t.split('.')[1]}`, 2000)).toBe(false); // exp changed
    expect(verifySession('secret', undefined)).toBe(false);
    expect(verifySession('', t)).toBe(false);
  });
  it('reads a named cookie', () => {
    expect(readCookie('a=1; sb_session=abc.def; b=2', 'sb_session')).toBe('abc.def');
    expect(readCookie(undefined, 'sb_session')).toBeUndefined();
  });
});

describe('passcode login', () => {
  const svc = () => new AuthService(cfg({ ACCESS_PASSCODE: 'open sesame', TOKEN_ENCRYPTION_KEY: 'k' }));

  it('issues a valid session for the right passcode', () => {
    const s = svc();
    expect(s.required()).toBe(true);
    expect(s.isAuthenticated(`sb_session=${s.login('open sesame', '1.1.1.1')}`)).toBe(true);
  });
  it('rejects a wrong passcode and rate limits repeated failures', () => {
    const s = svc();
    for (let i = 0; i < 5; i++) expect(() => s.login('nope', '2.2.2.2')).toThrow(UnauthorizedException);
    expect(() => s.login('open sesame', '2.2.2.2')).toThrow(HttpException); // locked out even with the right one
    expect(s.login('open sesame', '3.3.3.3')).toBeTruthy(); // other clients unaffected
  });
  it('does not require login when no passcode is configured', () => {
    const s = new AuthService(cfg({}));
    expect(s.required()).toBe(false);
    expect(() => s.login('x', '4.4.4.4')).toThrow(UnauthorizedException);
  });
});
