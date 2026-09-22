import { cvFacts, estimateYears, sections } from '../modules/cv-profiles/cv-text';
import { defaultFollowUp } from '../modules/applications/status-rules';
import { buildFallbackEmail, buildFollowUpEmail, cleanEmailText, wordCount, draftProblems, employerFor, experienceAnchors, findAiTells, findOverclaims, findUngrounded, findUngroundedNumbers, formatEmail, gapNote, mostlyIn, pickCloser } from '../modules/email/email-draft';
import { buildEmailPrompt } from '../modules/ai/prompts/email-generation.prompt';

const NOW = new Date('2026-09-22');
const CV = `Sam Lee

IT Support Specialist

EDUCATION

Higher Diploma in Computing - ICBT Campus May 2023 – October 2024

EXPERIENCE

Acme Retail | IT Support Specialist July 2025 – Present
Fixed printers and POS.

Unitrac | IT Support Specialist April 2022 – May 2025
Windows Server and Active Directory.

Freelance | Developer February 2022 – Present
Web apps.

SKILLS
Windows, AD`;

describe('CV facts', () => {
  it('splits a CV into its parts', () => {
    expect(Object.keys(sections(CV))).toEqual(['top', 'education', 'experience', 'skills']);
  });
  it('works out years from job dates, counts overlaps once and ignores study dates', () => {
    // Feb 2022 -> Sep 2026 = 4 years 8 months, rounded down to 4.5
    expect(estimateYears(CV, NOW)).toBe(4.5);
  });
  it('returns null when there are no dated jobs', () => {
    expect(estimateYears('Sam Lee\nExperience\nI fix computers.', NOW)).toBeNull();
  });
  it('gives the email only what the CV says', () => {
    const f = cvFacts(CV, NOW);
    expect(f.years).toBe(4.5);
    expect(f.experience).toContain('Unitrac');
    expect(f.experience).not.toContain('ICBT');
  });
});

describe('email style', () => {
  it('catches stock AI phrases and long drafts', () => {
    expect(findAiTells("I am writing to express my keen interest. I'm passionate about it.")).toEqual(expect.arrayContaining(['i am writing to', 'keen', 'passionate']));
    expect(draftProblems('word '.repeat(150))).toMatch(/150 words/);
    expect(draftProblems('Hi Acme team,\n\nI\'m applying for the Support role. I\'ve spent three years fixing Windows and Active Directory problems for a retail company, plus printers and POS gear on site. My CV is attached. Happy to talk whenever suits you.\n\nThanks,\nSam')).toBe('');
  });
  it('rejects technical terms that are not on the CV', () => {
    const cv = 'Unitrac IT Support. Windows Server, Active Directory, NestJS, PostgreSQL';
    expect(findUngrounded("I've run SIEM and PAM projects.", cv)).toEqual(['SIEM', 'PAM']);
    expect(findUngrounded("I've used NestJS and PostgreSQL. My CV is attached.", cv)).toEqual([]);
  });
  it('replaces em dashes', () => {
    expect(cleanEmailText('Fixed it — fast')).toBe('Fixed it, fast');
  });
  it('fallback email is short and plain', () => {
    const e = buildFallbackEmail({ jobTitle: 'Support Engineer', company: 'Acme', candidateName: 'Sam', cvName: 'IT', matchedSkills: ['Windows', 'Active Directory'], yearsExperience: 4.5 });
    expect(e.subject).toBe('Support Engineer application - Sam');
    expect(e.body).toContain('4.5 years working with Windows and Active Directory');
    expect(findAiTells(e.body)).toEqual([]);
  });
  it('prompt uses CV facts, not settings', () => {
    const p = buildEmailPrompt({
      jobTitle: 'Dev', company: 'Acme', description: 'd', cv: { name: 'FS', skills: ['React'], years: 4.5, summary: '', experience: 'Unitrac | IT Support' },
      candidate: { name: 'Sam', phone: '1' }, matchedSkills: ['React'], forbiddenSkills: ['Java'],
    });
    expect(p).toContain('Years of work experience (from CV dates): 4.5');
    expect(p).toContain('Unitrac | IT Support');
    expect(p).toContain('Do NOT claim or mention: Java');
  });
});

describe('email anchors', () => {
  const exp = 'Pandyt | Software Engineer July 2023 – Present\nContributed to MO Marketplace (mo.lk), a marketplace.\n\nBizpoz Retail Solution (WebEngine Trading WLL) | IT Support April 2022';
  it('finds real employers and projects on the CV', () => {
    const a = experienceAnchors(exp);
    expect(a).toEqual(expect.arrayContaining(['pandyt', 'bizpoz', 'mo marketplace']));
  });
});

describe('honesty and variety', () => {
  const cv = 'Collaborated in Agile teams using GitHub, Jira and sprint planning. Built NestJS services.';
  it('blocks leadership words the CV does not use, but allows the job title', () => {
    expect(findOverclaims('I managed Agile teams with Jira.', cv)).toEqual(['managed']);
    expect(findOverclaims('I worked in Agile teams with Jira.', cv)).toEqual([]);
    expect(findOverclaims("I'm applying for the Senior Backend Engineer role.", cv, 'Senior Backend Engineer')).toEqual([]);
    expect(findOverclaims('I managed the team.', 'Managed printers and servers.')).toEqual([]);
  });
  it('confirms a quoted CV line really comes from the CV', () => {
    expect(mostlyIn('Built NestJS services', cv)).toBe(true);
    expect(mostlyIn('Led a team of ten building Kubernetes clusters', cv)).toBe(false);
  });
  it('works out the seniority gap from numbers', () => {
    expect(gapNote(7, 5)).toContain('7+ years');
    expect(gapNote(7, 5)).toContain('about 5');
    expect(gapNote(3, 5)).toBe('');
    expect(gapNote(null, 5)).toBe('');
  });
  it('varies the closing line by job but is stable for the same job', () => {
    expect(pickCloser('job-a')).toBe(pickCloser('job-a'));
    const set = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map(pickCloser));
    expect(set.size).toBeGreaterThan(2);
  });
});

describe('email layout', () => {
  it('rebuilds greeting, paragraphs, closing line and sign-off from a single block of text', () => {
    const out = formatEmail("Hi Snoonu team, I'm applying for the Backend role. At Pandyt I built APIs. My CV is attached. I can talk this week. Thanks, Maizan");
    expect(out).toBe("Hi Snoonu team,\n\nI'm applying for the Backend role. At Pandyt I built APIs.\n\nMy CV is attached. I can talk this week.\n\nThanks,\nMaizan");
  });
  it('fixes a sign-off that sits on the closing line', () => {
    const out = formatEmail("Hi Anotech team,\n\nI'm applying. I fixed printers.\n\nCV attached. Call me. Thanks,\nMaizan");
    expect(out.endsWith('Call me.\n\nThanks,\nMaizan')).toBe(true);
  });
  it('gap wording varies but always states the numbers', () => {
    const notes = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => gapNote(7, 5, s)));
    expect(notes.size).toBeGreaterThan(1);
    for (const n of notes) expect(n).toContain('7+ years');
  });
});

describe('employer lookup', () => {
  const exp = 'Pandyt | Software Engineer July 2023 – Present\nBuilt NestJS services for MO Marketplace.\n\nUnitrac Lanka (Pvt) Ltd | IT Support Specialist April 2022 – May 2025\nAdministered Windows Server and Active Directory.';
  it('finds the employer whose block holds the evidence line', () => {
    expect(employerFor(exp, 'Built NestJS services for MO Marketplace')).toBe('Pandyt');
    expect(employerFor(exp, 'Administered Windows Server and Active Directory')).toBe('Unitrac Lanka Ltd');
    expect(employerFor(exp, 'Flew helicopters')).toBeNull();
  });
});

describe('numbers and greetings', () => {
  it('rejects figures that are not on the CV', () => {
    const cv = 'Supported 200 users from April 2022 to May 2025. 5 years.';
    expect(findUngroundedNumbers('Supporting 24x7 operations for 500 users.', cv)).toEqual(['24x7', '500']);
    expect(findUngroundedNumbers('About 5 years, supporting 200 users.', cv)).toEqual([]);
    expect(findUngroundedNumbers('I have 22 years', 'from 2022')).toEqual(['22']);
  });
  it('keeps a comma inside the company name in the greeting', () => {
    const out = formatEmail("Hi McDermott International, Ltd team, I'm applying for the role. CV attached. Thanks, Sam");
    expect(out.startsWith('Hi McDermott International, Ltd team,\n\nI\'m applying')).toBe(true);
  });
});

describe('fallback with a real CV line', () => {
  it('uses the CV line and employer when it reads naturally', () => {
    const e = buildFallbackEmail({
      jobTitle: 'Support Engineer', company: 'Acme', candidateName: 'Sam', cvName: 'IT', matchedSkills: [], yearsExperience: 5,
      evidence: { employer: 'Bizpoz Retail Solution', line: 'Minimized downtime by resolving network issues across retail POS environments.' },
    });
    expect(e.body).toContain('At Bizpoz Retail Solution, I minimized downtime by resolving network issues across retail POS environments.');
  });
  it('ignores a line that would not read naturally', () => {
    const e = buildFallbackEmail({ jobTitle: 'X', company: 'Acme', candidateName: 'Sam', cvName: 'IT', matchedSkills: ['Windows'], yearsExperience: null, evidence: { employer: 'Z', line: 'Experience with Windows' } });
    expect(e.body).not.toContain('At Z');
  });
});

describe('follow-up', () => {
  it('writes a short, plain follow-up note', () => {
    const n = buildFollowUpEmail({ company: 'Acme', jobTitle: 'Support Engineer', appliedDate: new Date('2026-09-10T10:00:00Z'), candidateName: 'Sam', originalSubject: 'Support Engineer application - Sam' });
    expect(n.subject).toBe('Re: Support Engineer application - Sam');
    expect(n.body).toContain('I applied for the Support Engineer role on 10 September');
    expect(n.body.endsWith('Thanks,\nSam')).toBe(true);
    expect(findAiTells(n.body)).toEqual([]);
    expect(wordCount(n.body)).toBeLessThan(60);
  });
  it('defaults the follow-up to a week after applying, at midday', () => {
    const d = defaultFollowUp(new Date('2026-09-10T20:00:00'));
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(12);
  });
});
