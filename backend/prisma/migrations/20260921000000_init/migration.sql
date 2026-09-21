-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID', 'ANY');

-- CreateEnum
CREATE TYPE "DatePostedFilter" AS ENUM ('PAST_24_HOURS', 'PAST_WEEK', 'PAST_MONTH', 'ANY_TIME');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'ANALYZING', 'ANALYZED', 'REVIEW', 'APPROVED', 'SENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'INTERVIEW', 'OFFER', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationMethod" AS ENUM ('EMAIL', 'WEBSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('APPLY', 'MAYBE', 'SKIP');

-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('GMAIL');

-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CVProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "filePath" TEXT,
    "originalFileName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "skills" TEXT[],
    "preferredJobKeywords" TEXT[],
    "excludedKeywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "CVProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "location" TEXT,
    "minMatchScore" INTEGER NOT NULL DEFAULT 50,
    "excludedKeywords" TEXT[],
    "preferredJobTypes" "JobType"[],
    "preferredLocations" TEXT[],
    "remotePreference" "RemotePreference" NOT NULL DEFAULT 'ANY',
    "datePosted" "DatePostedFilter" NOT NULL DEFAULT 'PAST_WEEK',
    "experienceLevel" TEXT,
    "sortBy" TEXT NOT NULL DEFAULT 'recent',
    "maxPages" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "JobSearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitMs" INTEGER NOT NULL DEFAULT 2000,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "normalizedCompany" TEXT NOT NULL,
    "location" TEXT,
    "normalizedLocation" TEXT,
    "description" TEXT NOT NULL,
    "jobUrl" TEXT,
    "jobType" "JobType",
    "applicationEmail" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "analysisError" TEXT,
    "postedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceListing" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobSourceId" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "sourceUrl" TEXT,
    "rawData" JSONB,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSourceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAnalysis" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "aiMatchScore" INTEGER NOT NULL,
    "finalMatchScore" INTEGER NOT NULL,
    "recommendedCvId" TEXT,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "experienceRequired" TEXT,
    "experienceCompatible" BOOLEAN NOT NULL,
    "locationCompatible" BOOLEAN NOT NULL,
    "salaryMentioned" BOOLEAN NOT NULL DEFAULT false,
    "applicationMethod" "ApplicationMethod" NOT NULL DEFAULT 'UNKNOWN',
    "recommendation" "Recommendation" NOT NULL,
    "reason" TEXT,
    "rawAiResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "location" TEXT,
    "source" TEXT,
    "jobUrl" TEXT,
    "matchScore" INTEGER,
    "selectedCvId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'REVIEW',
    "appliedDate" TIMESTAMP(3),
    "notes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "interviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "selectedCvPath" TEXT,
    "provider" "EmailProviderType" NOT NULL,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" "EmailProviderType" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStatusHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "jobSearchProfileId" TEXT,
    "status" "SearchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProfileSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CVProfile_category_idx" ON "CVProfile"("category");

-- CreateIndex
CREATE INDEX "CVProfile_enabled_idx" ON "CVProfile"("enabled");

-- CreateIndex
CREATE INDEX "JobSearchProfile_enabled_idx" ON "JobSearchProfile"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_key_key" ON "JobSource"("key");

-- CreateIndex
CREATE INDEX "JobSource_enabled_idx" ON "JobSource"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobUrl_key" ON "Job"("jobUrl");

-- CreateIndex
CREATE INDEX "Job_jobUrl_idx" ON "Job"("jobUrl");

-- CreateIndex
CREATE INDEX "Job_company_idx" ON "Job"("company");

-- CreateIndex
CREATE INDEX "Job_normalizedTitle_idx" ON "Job"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Job_postedAt_idx" ON "Job"("postedAt");

-- CreateIndex
CREATE INDEX "JobSourceListing_jobId_idx" ON "JobSourceListing"("jobId");

-- CreateIndex
CREATE INDEX "JobSourceListing_jobSourceId_idx" ON "JobSourceListing"("jobSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceListing_jobSourceId_sourceJobId_key" ON "JobSourceListing"("jobSourceId", "sourceJobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "JobAnalysis"("jobId");

-- CreateIndex
CREATE INDEX "JobAnalysis_finalMatchScore_idx" ON "JobAnalysis"("finalMatchScore");

-- CreateIndex
CREATE INDEX "JobAnalysis_recommendation_idx" ON "JobAnalysis"("recommendation");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_matchScore_idx" ON "Application"("matchScore");

-- CreateIndex
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDraft_applicationId_key" ON "EmailDraft"("applicationId");

-- CreateIndex
CREATE INDEX "EmailMessage_applicationId_idx" ON "EmailMessage"("applicationId");

-- CreateIndex
CREATE INDEX "EmailMessage_sentAt_idx" ON "EmailMessage"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_provider_emailAddress_key" ON "EmailAccount"("provider", "emailAddress");

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_applicationId_idx" ON "ApplicationStatusHistory"("applicationId");

-- CreateIndex
CREATE INDEX "SearchRun_status_idx" ON "SearchRun"("status");

-- CreateIndex
CREATE INDEX "SearchRun_startedAt_idx" ON "SearchRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "_ProfileSources_AB_unique" ON "_ProfileSources"("A", "B");

-- CreateIndex
CREATE INDEX "_ProfileSources_B_index" ON "_ProfileSources"("B");

-- AddForeignKey
ALTER TABLE "CVProfile" ADD CONSTRAINT "CVProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSearchProfile" ADD CONSTRAINT "JobSearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceListing" ADD CONSTRAINT "JobSourceListing_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceListing" ADD CONSTRAINT "JobSourceListing_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_recommendedCvId_fkey" FOREIGN KEY ("recommendedCvId") REFERENCES "CVProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_selectedCvId_fkey" FOREIGN KEY ("selectedCvId") REFERENCES "CVProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory" ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_jobSearchProfileId_fkey" FOREIGN KEY ("jobSearchProfileId") REFERENCES "JobSearchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileSources" ADD CONSTRAINT "_ProfileSources_A_fkey" FOREIGN KEY ("A") REFERENCES "JobSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileSources" ADD CONSTRAINT "_ProfileSources_B_fkey" FOREIGN KEY ("B") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

