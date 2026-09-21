-- The text read from the CV file, and the years of experience worked out from its dates.
ALTER TABLE "CVProfile" ADD COLUMN "textContent" TEXT;
ALTER TABLE "CVProfile" ADD COLUMN "experienceYears" DOUBLE PRECISION;
