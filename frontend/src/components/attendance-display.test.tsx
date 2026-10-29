import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttendanceBadge, PercentageDisplay } from '@/components/attendance-display';

describe('AttendanceBadge', () => {
  it('labels every attendance status', () => {
    const cases = [
      ['PRESENT', 'Present'],
      ['ABSENT', 'Absent'],
      ['LATE', 'Late'],
      ['ON_LEAVE', 'On Leave'],
    ] as const;

    for (const [status, label] of cases) {
      const { unmount } = render(<AttendanceBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('shows a neutral badge when nothing is marked', () => {
    render(<AttendanceBadge status={null} />);
    expect(screen.getByText('Not marked')).toBeInTheDocument();
  });
});

describe('PercentageDisplay', () => {
  it('renders the percentage with one decimal place', () => {
    render(<PercentageDisplay value={66.666} />);
    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('uses the danger tone below the threshold', () => {
    const { container } = render(<PercentageDisplay value={40} threshold={75} />);
    expect(container.querySelector('.text-destructive')).not.toBeNull();
  });

  it('uses the success tone at the threshold', () => {
    const { container } = render(<PercentageDisplay value={80} threshold={75} />);
    expect(container.querySelector('.text-success')).not.toBeNull();
  });

  it('clamps the progress bar to the valid range', () => {
    const { container } = render(<PercentageDisplay value={140} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
  });
});
