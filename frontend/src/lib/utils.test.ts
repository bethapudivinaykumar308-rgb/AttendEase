import { describe, expect, it } from 'vitest';
import {
  cn,
  formatDate,
  formatDateTime,
  formatPercentage,
  initials,
  percentageTone,
  todayString,
} from '@/lib/utils';

describe('Formatting helpers', () => {
  it('merges class names and lets the last utility win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-sm', false && 'hidden', 'font-medium')).toBe('text-sm font-medium');
  });

  it('formats a date for the local locale', () => {
    expect(formatDate('2026-03-09T00:00:00.000Z')).toMatch(/09 Mar 2026/);
  });

  it('falls back to a dash for a missing or invalid date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('formats a percentage with the requested precision', () => {
    expect(formatPercentage(66.666)).toBe('66.7%');
    expect(formatPercentage(66.666, 2)).toBe('66.67%');
    expect(formatPercentage(80, 0)).toBe('80%');
  });

  it('falls back to a dash for a missing percentage', () => {
    expect(formatPercentage(null)).toBe('—');
    expect(formatPercentage(undefined)).toBe('—');
    expect(formatPercentage(Number.NaN)).toBe('—');
  });

  it('derives the tone from the threshold', () => {
    expect(percentageTone(90)).toBe('success');
    expect(percentageTone(75)).toBe('success');
    expect(percentageTone(65)).toBe('warning');
    expect(percentageTone(40)).toBe('danger');
  });

  it('builds initials from the first two words', () => {
    expect(initials('Sita Sharma')).toBe('SS');
    expect(initials('Ada Administrator')).toBe('AA');
    expect(initials('Cher')).toBe('C');
  });

  it('returns today as a calendar date', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
