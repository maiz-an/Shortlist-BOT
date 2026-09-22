import { CvCandidate, selectCv } from '../modules/job-analysis/cv-selection';

/**
 * Uses the real skills/keywords from the two live CV profiles (Full Stack Developer CV,
 * IT Support CV) against realistic job postings for each, to make certain a Full Stack job
 * picks the Full Stack CV and an IT Support job picks the IT Support CV - never swapped.
 */
const FULL_STACK_CV: CvCandidate = {
  id: 'full-stack-cv',
  name: 'Full Stack Developer CV',
  category: 'FULL_STACK',
  skills: [
    'JavaScript', 'TypeScript', 'Python', 'C#', 'HTML5', 'CSS3', 'React.js', 'React', 'Next.js', 'Angular',
    'Flutter', 'Tailwind CSS', 'Responsive Design', 'PWA', 'Progressive Web Apps', 'React Hooks', 'Context API',
    'Node.js', 'NestJS', 'Express.js', 'ASP.NET Core', 'REST APIs', 'API Integration', 'JWT', 'OAuth',
    'Authorization', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Prisma ORM', 'Git', 'GitHub', 'GitLab',
    'Postman', 'Jira', 'Figma', 'CI/CD', 'Agile', 'Sprint Planning', 'Performance Optimization',
    'Cross-Browser Compatibility', 'English',
  ],
  preferredJobKeywords: [
    'Full Stack Developer', 'Software Engineer', 'React Developer', 'Frontend Developer', 'Backend Developer',
    'NestJS Developer', 'TypeScript Developer', 'Next.js Developer', 'Node.js Developer', 'Flutter Developer',
    'Web Developer', 'Mobile App Developer',
  ],
  excludedKeywords: [],
  years: 5,
};

const IT_SUPPORT_CV: CvCandidate = {
  id: 'it-support-cv',
  name: 'IT Support CV',
  category: 'IT_SUPPORT',
  skills: [
    'Help Desk', 'Desktop Support', 'Laptop Support', 'Hardware Troubleshooting', 'Software Troubleshooting',
    'Troubleshooting', 'Remote Desktop', 'RDP', 'Windows 10/11', 'Windows 10', 'Windows 11', 'Windows',
    'Windows Server', 'macOS', 'LAN/WAN', 'TCP/IP', 'DNS', 'DHCP', 'Routers', 'Switches', 'Wi-Fi',
    'Network Troubleshooting', 'Active Directory', 'User Account Management', 'Group Management',
    'Password Reset', 'Access Permissions', 'Microsoft 365', 'Office 365', 'Outlook', 'SharePoint', 'PowerPoint',
    'Network Printers', 'USB Printers', 'POS Printers', 'Label Printers', 'Printer Drivers', 'Barcode Scanners',
    'Cash Drawers', 'Domain Management', 'SPF', 'DKIM', 'Asset Management', 'Patch Management',
    'Antivirus Administration', 'JavaScript', 'TypeScript', 'Python', 'HTML5', 'CSS3', 'PostgreSQL', 'MySQL',
    'Microsoft Teams', 'Microsoft Excel', 'Microsoft Word', 'Microsoft Office', 'English', 'Malayalam', 'Tamil',
  ],
  preferredJobKeywords: [
    'IT Support', 'IT Support Specialist', 'Technical Support', 'IT Technician', 'Help Desk', 'Desktop Support',
    'System Administrator', 'IT Support Engineer', 'Helpdesk Technician', 'Service Desk',
  ],
  excludedKeywords: [],
  years: 5,
};

const CVS = [FULL_STACK_CV, IT_SUPPORT_CV];

const FULL_STACK_JOB = {
  title: 'Full Stack Developer (React / Node.js)',
  description: `We are hiring a Full Stack Developer to build web apps with React, Next.js and TypeScript on the
    frontend and NestJS / Node.js on the backend. You will design REST APIs, work with PostgreSQL and Prisma ORM,
    and collaborate in an Agile team using Git and Jira. Experience with Redis and CI/CD is a plus.`,
};

const IT_SUPPORT_JOB = {
  title: 'IT Support Specialist',
  description: `Looking for an IT Support Specialist to provide first- and second-line Help Desk support: Windows
    10/11 desktop troubleshooting, Active Directory user account management, password resets, network printers,
    and Microsoft 365 / Outlook support. Some networking (DNS, DHCP, Wi-Fi) knowledge needed.`,
};

describe('CV selection with the real CV profiles', () => {
  it('picks the Full Stack Developer CV for a Full Stack job, not IT Support', () => {
    const r = selectCv(FULL_STACK_JOB, CVS, 'FULL_STACK');
    expect(r.cvId).toBe('full-stack-cv');
    expect(r.ambiguous).toBe(false);
  });

  it('picks the IT Support CV for an IT Support job, not Full Stack', () => {
    const r = selectCv(IT_SUPPORT_JOB, CVS, 'IT_SUPPORT');
    expect(r.cvId).toBe('it-support-cv');
    expect(r.ambiguous).toBe(false);
  });

  it('still picks correctly even without an AI category hint, from title/skills alone', () => {
    expect(selectCv(FULL_STACK_JOB, CVS).cvId).toBe('full-stack-cv');
    expect(selectCv(IT_SUPPORT_JOB, CVS).cvId).toBe('it-support-cv');
  });

  it('is not a close call either way - a clear winner, not a coin flip', () => {
    const a = selectCv(FULL_STACK_JOB, CVS, 'FULL_STACK').ranking;
    const b = selectCv(IT_SUPPORT_JOB, CVS, 'IT_SUPPORT').ranking;
    expect(a[0].score - a[1].score).toBeGreaterThan(0.1);
    expect(b[0].score - b[1].score).toBeGreaterThan(0.1);
  });
});
