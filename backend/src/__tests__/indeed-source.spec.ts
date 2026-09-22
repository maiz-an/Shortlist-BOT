import { mapIndeedRows } from '../modules/job-sources/indeed.source';

describe('Indeed rows', () => {
  const rows = [
    { id: 'in-1', job_url: 'https://qa.indeed.com/viewjob?jk=1', title: ' IT Support Engineer ', company: 'Acme', location: 'Doha, QA', date_posted: '2026-09-20', job_type: 'fulltime', emails: 'hr@acme.com', description: '<p>Fix printers.</p>' },
    { id: 'in-2', title: 'No company', company: null },
    { id: 'in-3', job_url: 'https://qa.indeed.com/viewjob?jk=3', title: 'Helpdesk', company: 'Beta', date_posted: 'not a date', emails: null, description: 'Send your CV to jobs@beta.qa today.' },
    { id: 'in-4', job_url: 'https://qa.indeed.com/viewjob?jk=4', job_url_direct: 'https://beta.qa/apply', title: 'Dev', company: 'Gamma', emails: ['bad', 'dev@gamma.qa'], job_type: 'part-time' },
  ];
  it('maps good rows and drops rows without title or company', () => {
    const out = mapIndeedRows(rows);
    expect(out.map((j) => j.sourceJobId)).toEqual(['in-1', 'in-3', 'in-4']);
    expect(out[0]).toMatchObject({ sourceKey: 'indeed', title: 'IT Support Engineer', company: 'Acme', location: 'Doha, QA', jobType: 'FULL_TIME', applicationEmail: 'hr@acme.com' });
    expect(out[0].description).toContain('Fix printers.');
    expect(out[0].description).not.toContain('<p>');
  });
  it('finds an email in the description, ignores bad dates and prefers the direct url', () => {
    const out = mapIndeedRows(rows);
    expect(out[1].applicationEmail).toBe('jobs@beta.qa');
    expect(out[1].postedAt).toBeUndefined();
    expect(out[2].url).toBe('https://beta.qa/apply');
    expect(out[2].applicationEmail).toBe('dev@gamma.qa');
    expect(out[2].jobType).toBe('PART_TIME');
  });
});
