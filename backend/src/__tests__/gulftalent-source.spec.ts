import { mapGulfTalentItems } from '../modules/job-sources/gulftalent.source';

describe('GulfTalent items', () => {
  const items = [
    { jobId: 77, title: ' IT Support Engineer ', company: 'Acme Qatar', location: 'Doha', description: { text: '<p>Fix printers.</p>' }, applyUrl: 'https://gulftalent.com/job/77', postedAt: '2026-09-18T00:00:00Z', employmentType: 'Full-time', extractedEmails: ['bad', 'hr@acme.qa'] },
    { jobTitle: 'Helpdesk Analyst', company: 'Beta', description: 'Send CV to jobs@beta.qa now.', url: 'https://gulftalent.com/job/78', postedDateIso: 'garbage' },
    { title: 'No company' },
    { title: 'Dev', company: 'Gamma', descriptionMarkdown: '**Node** developer', extractedEmails: null },
  ];
  it('maps items from different actor shapes and drops incomplete ones', () => {
    const out = mapGulfTalentItems(items);
    expect(out.map((j) => j.title)).toEqual(['IT Support Engineer', 'Helpdesk Analyst', 'Dev']);
    expect(out[0]).toMatchObject({ sourceKey: 'gulftalent', sourceJobId: '77', company: 'Acme Qatar', location: 'Doha', jobType: 'FULL_TIME', applicationEmail: 'hr@acme.qa', url: 'https://gulftalent.com/job/77' });
    expect(out[0].description).toContain('Fix printers.');
    expect(out[0].description).not.toContain('<p>');
  });
  it('finds an email in the text, ignores bad dates, reads markdown descriptions', () => {
    const out = mapGulfTalentItems(items);
    expect(out[1].applicationEmail).toBe('jobs@beta.qa');
    expect(out[1].postedAt).toBeUndefined();
    expect(out[2].description).toContain('Node');
  });
});
