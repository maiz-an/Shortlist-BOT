-- A PDF you upload yourself for sending applications, separate from the CV file used for analysis.
ALTER TABLE "CVProfile" ADD COLUMN "sendPdfPath" TEXT;
ALTER TABLE "CVProfile" ADD COLUMN "sendPdfOriginalFileName" TEXT;
