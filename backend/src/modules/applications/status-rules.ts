import { BadRequestException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';

/** Statuses only the system may set (pipeline stages that must reflect real work). */
export const SYSTEM_ONLY: JobStatus[] = ['NEW', 'ANALYZING', 'SENDING'];

/** Statuses that require an Application record to exist. */
export const APPLICATION_STATUSES: JobStatus[] = [
  'REVIEW', 'APPROVED', 'SENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'INTERVIEW', 'OFFER', 'CLOSED',
];

/**
 * Manual status changes are free-form (the user knows best, e.g. an interview arrived),
 * except for system-controlled stages, and nothing may be manually moved while a send is in flight.
 */
export function assertManualTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) throw new BadRequestException(`Already ${to}`);
  if (from === 'SENDING') throw new BadRequestException('Application is currently being sent');
  if (SYSTEM_ONLY.includes(to)) throw new BadRequestException(`${to} is set automatically by the system`);
}

/** When to follow up if the employer has not replied: a week after applying, at midday so the date is stable in any timezone. */
export function defaultFollowUp(from: Date, days = 7): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Setting a date-bearing status for the first time stamps the applied date. */
export function setsAppliedDate(to: JobStatus): boolean {
  return to === 'APPLIED';
}
