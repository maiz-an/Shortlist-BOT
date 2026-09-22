import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';

export function responseRate(sent: number, responded: number): number {
  return sent === 0 ? 0 : Math.round((responded / sent) * 1000) / 10;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async stats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const t = await this.settings.get('match_score_thresholds');
    const strong = { analysis: { is: { finalMatchScore: { gte: t.strong[0] } } } };
    const sentWhere = { appliedDate: { not: null } } as const;
    const endOfToday = new Date(startOfDay.getTime() + 24 * 3600 * 1000 - 1);
    const dueWhere = { status: 'APPLIED' as const, followUpDate: { lte: endOfToday } };
    const [candidate, jobsFound, todayNew, analyzed, strongMatches, todayStrong, pendingReview, sent, todaySent, interviews, offers, rejected, respondedRejected, lastRun, dueCount, dueItems, recent] =
      await Promise.all([
        this.settings.get('candidate'),
        this.prisma.job.count(),
        this.prisma.job.count({ where: { createdAt: { gte: startOfDay } } }),
        this.prisma.jobAnalysis.count(),
        this.prisma.job.count({ where: strong }),
        this.prisma.job.count({ where: { ...strong, createdAt: { gte: startOfDay } } }),
        this.prisma.job.count({ where: { status: 'REVIEW' } }),
        this.prisma.application.count({ where: sentWhere }),
        this.prisma.application.count({ where: { appliedDate: { gte: startOfDay } } }),
        this.prisma.application.count({ where: { status: 'INTERVIEW' } }),
        this.prisma.application.count({ where: { status: 'OFFER' } }),
        this.prisma.application.count({ where: { status: 'REJECTED', ...sentWhere } }),
        this.prisma.application.count({ where: { status: { in: ['INTERVIEW', 'OFFER', 'REJECTED'] }, ...sentWhere } }),
        this.prisma.searchRun.findFirst({ orderBy: { startedAt: 'desc' }, include: { jobSearchProfile: { select: { name: true } } } }),
        this.prisma.application.count({ where: dueWhere }),
        this.prisma.application.findMany({ where: dueWhere, take: 5, orderBy: { followUpDate: 'asc' }, select: { id: true, company: true, jobTitle: true, followUpDate: true } }),
        this.prisma.job.findMany({
          where: { status: 'REVIEW' }, take: 5, orderBy: { analysis: { finalMatchScore: 'desc' } },
          select: { id: true, title: true, company: true, location: true, analysis: { select: { finalMatchScore: true, recommendedCv: { select: { name: true } } } } },
        }),
      ]);
    return {
      name: candidate.name || null,
      totals: { jobsFound, todayNew, jobsAnalyzed: analyzed, strongMatches, pendingReview, applicationsSent: sent, interviews, offers, rejected },
      today: { newJobs: todayNew, strongMatches: todayStrong, pendingReview, applicationsSent: todaySent },
      responseRate: responseRate(sent, respondedRejected),
      lastRun, topReview: recent, followUps: { due: dueCount, items: dueItems },
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  stats() {
    return this.dashboard.stats();
  }
}

@Module({ imports: [SettingsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
