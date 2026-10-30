import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CountdownTimer } from '@/components/CountdownTimer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('CountdownTimer accessible name (#315)', () => {
  it('exposes a timer describing the remaining time in words', () => {
    const deadline = new Date(Date.now() + 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 30_000);
    render(<CountdownTimer deadline={deadline} />);

    const timer = screen.getByRole('timer', { name: '1 day 2 hours 3 minutes remaining' });
    expect(timer).not.toHaveAttribute('aria-live');
  });

  it('names an overdue timer as overdue', () => {
    render(<CountdownTimer deadline={new Date(Date.now() - 1_000)} />);

    expect(screen.getByRole('timer', { name: 'Overdue' })).toBeInTheDocument();
  });
});

describe('CountdownTimer screen reader announcement (#667)', () => {
  it('renders the timer span with role="timer" and an accessible name describing remaining time', () => {
    const deadline = new Date(Date.now() + 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 30_000);
    render(<CountdownTimer deadline={deadline} />);

    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('role', 'timer');
    expect(timer).toHaveAccessibleName('1 day 2 hours 3 minutes remaining');
  });

  it('announces an overdue timer with the accessible name "Overdue"', () => {
    render(<CountdownTimer deadline={new Date(Date.now() - 1_000)} />);

    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('role', 'timer');
    expect(timer).toHaveAccessibleName('Overdue');
  });
});