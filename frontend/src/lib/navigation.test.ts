import { describe, expect, it } from 'vitest';
import { navigation, roleHome, roleLabel } from '@/lib/navigation';
import type { Role } from '@/types';

function linksFor(role: Role): string[] {
  return navigation[role].flatMap((group) => group.items.map((item) => item.to));
}

describe('Role based navigation', () => {
  it('sends every role to its own dashboard', () => {
    expect(roleHome.ADMIN).toBe('/admin');
    expect(roleHome.FACULTY).toBe('/faculty');
    expect(roleHome.STUDENT).toBe('/student');
  });

  it('labels every role', () => {
    expect(roleLabel.ADMIN).toBe('Administrator');
    expect(roleLabel.FACULTY).toBe('Faculty');
    expect(roleLabel.STUDENT).toBe('Student');
  });

  it('gives the administrator the full management surface', () => {
    const links = linksFor('ADMIN');
    expect(links).toContain('/admin/students');
    expect(links).toContain('/admin/faculty');
    expect(links).toContain('/admin/subjects');
    expect(links).toContain('/admin/assignments');
    expect(links).toContain('/admin/enrollments');
    expect(links).toContain('/admin/audit-logs');
    expect(links).toContain('/admin/reports');
  });

  it('never shows the administrative links to a faculty member', () => {
    const links = linksFor('FACULTY');
    expect(links).not.toContain('/admin/students');
    expect(links).not.toContain('/admin/faculty');
    expect(links).not.toContain('/admin/audit-logs');
    expect(links).not.toContain('/admin/settings');
    expect(links.every((link) => link.startsWith('/faculty'))).toBe(true);
  });

  it('never shows the administrative links to a student', () => {
    const links = linksFor('STUDENT');
    expect(links).not.toContain('/admin/students');
    expect(links).not.toContain('/admin/reports');
    expect(links.every((link) => link.startsWith('/student'))).toBe(true);
  });

  it('keeps the student navigation read only', () => {
    const links = linksFor('STUDENT');
    expect(links).toContain('/student/attendance');
    expect(links).toContain('/student/subjects');
    expect(links).toContain('/student/history');
    expect(links).toContain('/student/profile');
    expect(links).not.toContain('/student/mark-attendance');
  });
});
