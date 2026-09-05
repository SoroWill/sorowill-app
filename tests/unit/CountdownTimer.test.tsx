import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CountdownTimer } from '@/components/CountdownTimer';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Reads the countdown span's full textContent regardless of React's text node splitting. */
function getCountdownText(): string {
  const span = document.querySelector('span.tabular-nums');
  return span ? span.textContent ?? '' : '';
}

describe('CountdownTimer', () => {
  it('renders the countdown in DD:HH:MM:SS format', () => {
    // The component floors elapsed time to whole seconds, so asserting an
    // exact seconds value is inherently flaky: any render/test-harness delay
    // between capturing `future` and the first computeSeconds() call shifts
    // the displayed seconds down by however long that took. Days/hours/
    // minutes are stable against a few seconds of delay, so only those are
    // asserted exactly; seconds is checked against the DD:HH:MM:SS shape.
    const future = new Date(Date.now() + 86_400_000 + 3_600_000 + 60_000 + 30_000);
    render(<CountdownTimer deadline={future} />);
    const text = getCountdownText();
    expect(text).toMatch(/^01:01:01:\d{2}$/);
  });

  it('shows overdue when deadline is in the past', () => {
    const past = new Date(Date.now() - 1000);
    render(<CountdownTimer deadline={past} />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    const future = new Date(Date.now() + 86_400_000);
    render(<CountdownTimer deadline={future} label="Next check-in due" />);
    expect(screen.getByText('Next check-in due')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const future = new Date(Date.now() + 86_400_000);
    const { container } = render(<CountdownTimer deadline={future} />);
    expect(container.querySelector('span.text-xs')).not.toBeInTheDocument();
  });

  it('updates every second via setInterval', () => {
    vi.useFakeTimers();
    // deadline = now + 1 day + 2.5 s
    // Initial render: floor((now + 1d + 2500 - now) / 1000) = floor(86402.5) = 86402 s = 01:00:00:02
    // After +1 s advance: deadline - now = 86401.5ms → 86401 s = 01:00:00:01
    // After +2 s advance: deadline - now = 86400.5ms → 86400 s = 01:00:00:00
    const future = new Date(Date.now() + 86_400_000 + 2_500);
    render(<CountdownTimer deadline={future} />);
    expect(getCountdownText()).toBe('01:00:00:02');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getCountdownText()).toBe('01:00:00:00');

    vi.useRealTimers();
  });

  it('applies green color for >3 days', () => {
    const future = new Date(Date.now() + 86_400_000 * 5);
    render(<CountdownTimer deadline={future} />);
    const span = document.querySelector('span.tabular-nums');
    expect(span?.className).toContain('text-emerald-400');
  });

  it('applies amber color for <3 days', () => {
    const future = new Date(Date.now() + 86_400_000 * 2);
    render(<CountdownTimer deadline={future} />);
    const span = document.querySelector('span.tabular-nums');
    expect(span?.className).toContain('text-amber-400');
  });

  it('applies red color for overdue', () => {
    const past = new Date(Date.now() - 1000);
    render(<CountdownTimer deadline={past} />);
    const span = screen.getByText(/overdue/i);
    expect(span.className).toContain('text-red-400');
  });
});
