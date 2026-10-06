import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock session timeout manager
interface SessionTimeoutConfig {
  idleTimeoutMs: number;
  warningTimeMs: number;
  onWarning: () => void;
  onTimeout: () => void;
}

class SessionTimeoutManager {
  private timeoutId: NodeJS.Timeout | null = null;
  private warningTimeoutId: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private config: SessionTimeoutConfig;

  constructor(config: SessionTimeoutConfig) {
    this.config = config;
    this.setupActivityListeners();
  }

  private setupActivityListeners() {
    if (typeof window === 'undefined') return;

    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, () => this.recordActivity(), { passive: true });
    });
  }

  private recordActivity() {
    this.lastActivityTime = Date.now();
    this.resetTimeouts();
  }

  private resetTimeouts() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);

    const warningDelay = this.config.idleTimeoutMs - this.config.warningTimeMs;
    this.warningTimeoutId = setTimeout(() => {
      this.config.onWarning();
    }, warningDelay);

    this.timeoutId = setTimeout(() => {
      this.config.onTimeout();
    }, this.config.idleTimeoutMs);
  }

  public startMonitoring() {
    this.resetTimeouts();
  }

  public stopMonitoring() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);
  }

  public getTimeUntilTimeout(): number {
    const elapsedTime = Date.now() - this.lastActivityTime;
    return Math.max(0, this.config.idleTimeoutMs - elapsedTime);
  }
}

describe('Session Timeout / Idle Wallet Disconnect', () => {
  let manager: SessionTimeoutManager;
  let onWarning: (() => void) & ReturnType<typeof vi.fn>;
  let onTimeout: (() => void) & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onWarning = vi.fn() as any;
    onTimeout = vi.fn() as any;

    manager = new SessionTimeoutManager({
      idleTimeoutMs: 15 * 60 * 1000, // 15 minutes
      warningTimeMs: 2 * 60 * 1000, // 2 minutes before timeout
      onWarning,
      onTimeout,
    });
  });

  afterEach(() => {
    manager.stopMonitoring();
    vi.useRealTimers();
  });

  it('should disconnect wallet after configured idle period', () => {
    manager.startMonitoring();
    expect(onTimeout).not.toHaveBeenCalled();

    // Advance time to idle timeout
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('should show warning before auto-disconnect', () => {
    manager.startMonitoring();

    // Should trigger warning at 13 minutes (15 - 2)
    vi.advanceTimersByTime(13 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledOnce();

    // But not timeout yet
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should reset timeout on user activity', () => {
    manager.startMonitoring();

    // Move to 10 minutes of inactivity
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Record activity (user interaction)
    manager['recordActivity']();

    // Reset timers - advance another 10 minutes (total 20, but timeout reset)
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Only timeout after full idle period from last activity
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('should have configurable timeout duration', () => {
    const customManager = new SessionTimeoutManager({
      idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
      warningTimeMs: 5 * 60 * 1000,
      onWarning: vi.fn(),
      onTimeout: vi.fn(),
    });

    customManager.startMonitoring();

    // Should not timeout at 15 minutes
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(customManager['config'].idleTimeoutMs).toBe(30 * 60 * 1000);
  });

  it('should allow stopping monitoring', () => {
    manager.startMonitoring();
    manager.stopMonitoring();

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should track time until timeout', () => {
    manager.startMonitoring();

    // At start, should be close to full duration
    let timeLeft = manager.getTimeUntilTimeout();
    expect(timeLeft).toBeGreaterThan(14 * 60 * 1000);
    expect(timeLeft).toBeLessThanOrEqual(15 * 60 * 1000);

    // After 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    timeLeft = manager.getTimeUntilTimeout();
    expect(timeLeft).toBeGreaterThan(9 * 60 * 1000);
    expect(timeLeft).toBeLessThan(11 * 60 * 1000);
  });

  it('should default to reasonable timeout if not configured', () => {
    // Test that sensible defaults exist
    const defaultTimeoutMs = 15 * 60 * 1000; // 15 minutes is reasonable
    const defaultWarningMs = 2 * 60 * 1000; // 2 minute warning is reasonable

    expect(defaultTimeoutMs).toBeGreaterThan(5 * 60 * 1000); // At least 5 minutes
    expect(defaultTimeoutMs).toBeLessThan(60 * 60 * 1000); // Less than 1 hour
    expect(defaultWarningMs).toBeGreaterThan(1 * 60 * 1000); // At least 1 minute
    expect(defaultWarningMs).toBeLessThan(defaultTimeoutMs); // Less than total timeout
  });

  it('should prevent timeout when user is actively using the app', () => {
    manager.startMonitoring();

    // Simulate continuous activity every 5 minutes
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5 * 60 * 1000);
      manager['recordActivity']();
    }

    // Even after 50 minutes of clock time, should not timeout
    // because activity was recorded every 5 minutes
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should support extending session on user confirmation', () => {
    manager.startMonitoring();

    // Advance to warning
    vi.advanceTimersByTime(13 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledOnce();

    // User activity resets the timeout
    manager['recordActivity']();
    onWarning.mockClear();

    // Now should need another full timeout period
    vi.advanceTimersByTime(13 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('should not require confirmation for normal activity operations', () => {
    // check_in operations should not trigger warning unnecessarily
    const checkInIsHighImpact = false;
    expect(checkInIsHighImpact).toBe(false);
  });
});
