-- Set once a WhatsApp alert is sent for a job, so it is never sent twice.
ALTER TABLE "JobAnalysis" ADD COLUMN "whatsappNotifiedAt" TIMESTAMP(3);
