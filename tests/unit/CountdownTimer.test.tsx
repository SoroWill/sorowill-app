import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CountdownTimer, formatCountdown } from '@/components/CountdownTimer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

/** Reads the countdown span's full textContent regardless of React's text node splitting. */
function getCountdownText(): string {
  const span = document.querySelector('span.tabular-nums');
  return span ? span.textContent ?? '' : '';
}

describe('CountdownTimer', () => {
  it('renders days, hours and minutes when a day or more is left', () => {
    // The component floors elapsed time to whole seconds, so asserting an
    // exact seconds value is inherently flaky: any render/test-harness delay
    // between capturing `future` and the first computeSeconds() call shifts
    // the displayed seconds down by however long that took. Days/hours/
    // minutes are stable against a few seconds of delay, so only those are
    // asserted exactly; a day or more left shows no seconds at all.
    const future = new Date(Date.now() + 86_400_000 + 3_600_000 + 60_000 + 30_000);
    render(<CountdownTimer deadline={future} />);
    const text = getCountdownText();
    expect(text).toBe('1d 01h 01m');
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
    // deadline = now + 1 hour + 2.5 s
    // Initial render: floor(3602.5) = 3602 s = 1h 00m 02s
    // After +2 s advance: deadline - now = 3600.5 s → 3600 s = 1h 00m 00s
    const future = new Date(Date.now() + 3_600_000 + 2_500);
    render(<CountdownTimer deadline={future} />);
    expect(getCountdownText()).toBe('1h 00m 02s');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getCountdownText()).toBe('1h 00m 00s');

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

  it('stops interval once deadline has passed (#195)', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const future = new Date(Date.now() + 2000);
    render(<CountdownTimer deadline={future} />);

    // Advance timer past 0
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('pauses countdown when document is hidden (#73)', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const future = new Date(Date.now() + 10_000);
    render(<CountdownTimer deadline={future} />);

    // Mock document.hidden = true and fire visibilitychange
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(clearIntervalSpy).toHaveBeenCalled();

    // Reset document.hidden
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('shows the absolute deadline and days until it', () => {
    const future = new Date(Date.now() + 2 * 86_400_000 + 60_000);
    render(<CountdownTimer deadline={future} />);
    expect(screen.getByText(new RegExp(`Due ${future.toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
    expect(screen.getByText(/3 days left/)).toBeInTheDocument();
  });
});

describe('formatCountdown (#822)', () => {
  it('shows days, hours and minutes from one day on', () => {
    expect(formatCountdown(86_400)).toBe('1d 00h 00m');
    expect(formatCountdown(2 * 86_400 + 3 * 3_600 + 15 * 60 + 9)).toBe('2d 03h 15m');
  });

  it('shows hours, minutes and seconds under a day', () => {
    expect(formatCountdown(86_399)).toBe('23h 59m 59s');
    expect(formatCountdown(3_600)).toBe('1h 00m 00s');
  });

  it('shows minutes and seconds under an hour', () => {
    expect(formatCountdown(3_599)).toBe('59m 59s');
    expect(formatCountdown(60)).toBe('1m 00s');
  });

  it('shows only seconds under a minute and never goes negative', () => {
    expect(formatCountdown(59)).toBe('59s');
    expect(formatCountdown(0)).toBe('0s');
    expect(formatCountdown(-5)).toBe('0s');
  });
});
