import dayjs from 'dayjs';

export function startOfToday(): Date {
  return new Date(`${dayjs().format('YYYY-MM-DD')}T00:00:00.000Z`);
}

export function endOfToday(): Date {
  return new Date(`${dayjs().format('YYYY-MM-DD')}T23:59:59.999Z`);
}

export function isFutureDate(date: Date): boolean {
  return formatDate(date) > dayjs().format('YYYY-MM-DD');
}

/**
 * Formats a DATE column as `YYYY-MM-DD`. Values are stored at UTC midnight so
 * the ISO representation is stable regardless of the server timezone.
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

export function todayString(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function monthKey(date: Date): string {
  return dayjs(formatDate(date)).format('YYYY-MM');
}

export function monthLabel(key: string): string {
  return dayjs(`${key}-01`).format('MMM YYYY');
}
