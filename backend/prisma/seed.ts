import { PrismaClient, RemotePreference, DatePostedFilter } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'maizan@local' },
    update: {},
    create: {
      email: 'maizan@local',
      name: 'Maizan',
    },
  });

  // --- Job sources -----------------------------------------------------
  await prisma.jobSource.upsert({
    where: { key: 'linkedin' },
    update: {},
    create: {
      key: 'linkedin',
      name: 'LinkedIn',
      enabled: true,
      rateLimitMs: 3000,
    },
  });

  for (const key of ['indeed', 'bayt', 'gulftalent', 'qatar_living']) {
    await prisma.jobSource.upsert({
      where: { key },
      update: {},
      create: {
        key,
        name: key,
        enabled: false, // scaffolded for future phases, not implemented in V1
      },
    });
  }

  // --- CV profiles -------------------------------------------------------
  const seeded = (await prisma.cVProfile.count()) > 0;
  const fullStackCv = seeded ? { name: 'Full Stack Developer CV' } : await prisma.cVProfile.create({
    data: {
      name: 'Full Stack Developer CV',
      description: 'Primary CV for full stack / software engineer roles.',
      category: 'FULL_STACK',
      enabled: true,
      skills: ['React', 'TypeScript', 'NestJS', 'PostgreSQL', 'Node.js', 'Prisma'],
      preferredJobKeywords: [
        'Full Stack Developer',
        'Software Engineer',
        'React Developer',
        'Frontend Developer',
        'Backend Developer',
        'NestJS Developer',
        'TypeScript Developer',
      ],
      excludedKeywords: [],
      userId: user.id,
    },
  });

  const itSupportCv = seeded ? { name: 'IT Support CV' } : await prisma.cVProfile.create({
    data: {
      name: 'IT Support CV',
      description: 'Primary CV for IT support / help desk / sysadmin roles.',
      category: 'IT_SUPPORT',
      enabled: true,
      skills: ['Windows Server', 'Active Directory', 'Networking', 'Help Desk', 'Troubleshooting'],
      preferredJobKeywords: [
        'IT Support',
        'IT Support Specialist',
        'Technical Support',
        'IT Technician',
        'Help Desk',
        'Desktop Support',
        'System Administrator',
      ],
      excludedKeywords: [],
      userId: user.id,
    },
  });

  if (!seeded) await prisma.cVProfile.create({
    data: {
      name: 'Other IT CV',
      description: 'Secondary CV for general/adjacent IT roles.',
      category: 'OTHER_IT',
      enabled: true,
      skills: [],
      preferredJobKeywords: [],
      excludedKeywords: [],
      userId: user.id,
    },
  });

  // --- Job search profiles -----------------------------------------------
  const developerSource = await prisma.jobSource.findUniqueOrThrow({ where: { key: 'linkedin' } });

  const profilesSeeded = (await prisma.jobSearchProfile.count()) > 0;
  if (!profilesSeeded) await prisma.jobSearchProfile.create({
    data: {
      name: 'Developer',
      keywords: [
        'Full Stack Developer',
        'Software Engineer',
        'React Developer',
        'Frontend Developer',
        'Backend Developer',
        'NestJS Developer',
        'TypeScript Developer',
      ],
      location: 'Qatar',
      minMatchScore: 50,
      excludedKeywords: [],
      preferredJobTypes: ['FULL_TIME'],
      preferredLocations: ['Qatar'],
      remotePreference: RemotePreference.ANY,
      datePosted: DatePostedFilter.PAST_WEEK,
      enabled: true,
      userId: user.id,
      sources: { connect: [{ id: developerSource.id }] },
    },
  });

  if (!profilesSeeded) await prisma.jobSearchProfile.create({
    data: {
      name: 'IT Support',
      keywords: [
        'IT Support',
        'IT Support Specialist',
        'Technical Support',
        'IT Technician',
        'Help Desk',
        'Desktop Support',
        'System Administrator',
      ],
      location: 'Qatar',
      minMatchScore: 50,
      excludedKeywords: [],
      preferredJobTypes: ['FULL_TIME'],
      preferredLocations: ['Qatar'],
      remotePreference: RemotePreference.ANY,
      datePosted: DatePostedFilter.PAST_WEEK,
      enabled: true,
      userId: user.id,
      sources: { connect: [{ id: developerSource.id }] },
    },
  });

  // --- Scoring thresholds (section 8), configurable via SystemSetting ----
  await prisma.systemSetting.upsert({
    where: { key: 'match_score_thresholds' },
    update: {},
    create: {
      key: 'match_score_thresholds',
      value: {
        poor: [0, 49],
        possible: [50, 69],
        good: [70, 79],
        strong: [80, 89],
        excellent: [90, 100],
      },
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'candidate' },
    update: {},
    create: { key: 'candidate', value: { name: 'Maizan', email: '', phone: '' } },
  });

  console.log('Seed complete:', {
    user: user.email,
    cvProfiles: [fullStackCv.name, itSupportCv.name, 'Other IT CV'],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
