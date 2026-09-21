import { canonicalUrl, containsTerm, extractEmail, normalizeCompany, normalizeLocation, normalizeTitle } from '../common/utils/normalize';
import { decrypt, encrypt } from '../common/utils/crypto';
import { toPlainText } from '../common/utils/sanitize';
import { DedupeFields, detectDuplicate } from '../modules/jobs/dedupe';
import { normalizeRawJob } from '../modules/jobs/jobs.service';

describe('normalization', () => {
  it('normalizes company names', () => {
    expect(normalizeCompany('ABC Technologies W.L.L.')).toBe('abc technologies');
    expect(normalizeCompany('Ooredoo Q.P.S.C')).toBe('ooredoo');
    expect(normalizeCompany('Acme LLC')).toBe('acme');
  });
  it('normalizes titles', () => {
    expect(normalizeTitle('Senior Full-Stack Developer (m/f/d) - URGENT')).toBe('senior full stack developer');
  });
  it('normalizes locations and dedupes tokens', () => {
    expect(normalizeLocation('Doha, Doha, Qatar')).toBe('doha qatar');
    expect(normalizeLocation(null)).toBe('');
  });
  it('canonicalizes URLs', () => {
    expect(canonicalUrl('https://www.linkedin.com/jobs/view/dev-123?refId=abc&trk=x#top')).toBe('https://www.linkedin.com/jobs/view/dev-123');
    expect(canonicalUrl('not a url')).toBeNull();
  });
  it('matches whole terms including symbols', () => {
    expect(containsTerm('We use C++ and .NET daily', 'C++')).toBe(true);
    expect(containsTerm('We use JavaScript', 'Java')).toBe(false);
  });
  it('extracts emails', () => {
    expect(extractEmail('Send CV to HR@Acme.com today')).toBe('hr@acme.com');
  });
  it('normalizeRawJob strips HTML and rejects incomplete jobs', () => {
    const n = normalizeRawJob({ sourceKey: 'x', title: '<b>Dev</b>', company: 'Acme LLC', description: '<p>Hello<br>apply@acme.com</p><script>alert(1)</script>' });
    expect(n?.title).toBe('Dev');
    expect(n?.description).not.toContain('<');
    expect(n?.applicationEmail).toBe('apply@acme.com');
    expect(normalizeRawJob({ sourceKey: 'x', title: '', company: 'A' })).toBeNull();
  });
  it('strips scripts from plain text', () => {
    expect(toPlainText('<img src=x onerror=alert(1)>hi')).toBe('hi');
  });
});

const base = (o: Partial<DedupeFields> = {}): DedupeFields => ({
  normalizedCompany: 'abc technologies', normalizedTitle: 'full stack developer', normalizedLocation: 'doha qatar',
  canonicalUrl: null, description: '', ...o,
});
const longDesc = 'We are hiring a developer to build web applications using React TypeScript NestJS and PostgreSQL in a collaborative team environment. '.repeat(4);

describe('duplicate detection', () => {
  it('same URL is a duplicate', () => {
    expect(detectDuplicate(base({ canonicalUrl: 'https://a/1', normalizedCompany: 'x' }), base({ canonicalUrl: 'https://a/1' }))).toBe('url');
  });
  it('same company/title/location is a duplicate', () => {
    expect(detectDuplicate(base(), base())).toBe('company-title-location');
  });
  it('subset location still matches (doha vs doha qatar)', () => {
    expect(detectDuplicate(base({ normalizedLocation: 'doha' }), base())).toBe('company-title-location');
  });
  it('different city is not a duplicate', () => {
    expect(detectDuplicate(base({ normalizedLocation: 'dubai uae' }), base())).toBeNull();
  });
  it('different company is not a duplicate', () => {
    expect(detectDuplicate(base({ normalizedCompany: 'other' }), base())).toBeNull();
  });
  it('similar title + near-identical description is a duplicate', () => {
    const a = base({ normalizedTitle: 'full stack developer', description: longDesc });
    const b = base({ normalizedTitle: 'senior full stack developer', description: longDesc + ' Apply now.' });
    expect(detectDuplicate(a, b)).toBe('description-similarity');
  });
  it('similar title but different description is not a duplicate', () => {
    const a = base({ normalizedTitle: 'full stack developer', description: longDesc });
    const b = base({ normalizedTitle: 'senior full stack developer', description: 'Completely different responsibilities about accounting payroll invoices ledgers and audits. '.repeat(5) });
    expect(detectDuplicate(a, b)).toBeNull();
  });
});

describe('crypto', () => {
  it('round-trips and rejects tampering', () => {
    const c = encrypt('secret-token', 'key');
    expect(decrypt(c, 'key')).toBe('secret-token');
    expect(() => decrypt(c, 'other')).toThrow();
  });
});
