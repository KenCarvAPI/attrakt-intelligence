/**
 * ISO-week period helpers.
 *
 * Scores are bucketed by ISO week, formatted "YYYY-Www" (e.g. "2026-W24"). ISO
 * weeks start on Monday; week 1 is the week containing the first Thursday of the
 * year. All maths is done in UTC to avoid timezone drift.
 */
import { CONSISTENCY_WINDOW_DAYS } from './score';

/** Return the ISO week number and ISO week-year for a date. */
function isoWeekParts(date: Date): { year: number; week: number } {
  // Copy to a UTC date at midnight.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO: Thursday determines the year. Shift to the Thursday of this week.
  const day = d.getUTCDay() || 7; // Sunday (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

/** Format a date as an ISO-week period string, e.g. "2026-W24". */
export function toPeriod(date: Date = new Date()): string {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Resolve the [start, end) UTC bounds of the ISO week containing `date`.
 * Start is Monday 00:00:00.000 UTC; end is the following Monday.
 */
export function periodRange(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday=1 ... Sunday=7
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - (day - 1));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

/** Start of the trailing consistency window ending at `end`. */
export function consistencyWindowStart(
  end: Date,
  windowDays: number = CONSISTENCY_WINDOW_DAYS
): Date {
  return new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
}
