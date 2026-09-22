import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiTokenGuard } from './common/guards/api-token.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { ApplicationsModule } from './modules/applications/applications.controller';
import { CvProfilesModule } from './modules/cv-profiles/cv-profiles.controller';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { EmailModule } from './modules/email/email.module';
import { JobAnalysisModule } from './modules/job-analysis/job-analysis.module';
import { JobSourcesModule } from './modules/job-sources/job-sources.module';
import { JobsModule } from './modules/jobs/jobs.controller';
import { SearchModule } from './modules/search/search.module';
import { SettingsModule } from './modules/settings/settings.controller';
import { SystemModule } from './modules/system/system.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuthModule,
    AiModule,
    SettingsModule,
    CvProfilesModule,
    JobSourcesModule,
    JobsModule,
    ApplicationsModule,
    JobAnalysisModule,
    SearchModule,
    EmailModule,
    DashboardModule,
    HealthModule,
    DatabaseModule,
    WhatsAppModule,
    SystemModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ApiTokenGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
