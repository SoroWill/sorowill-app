// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRefreshOnVisible } from '@/lib/useRefreshOnVisible';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useRefreshOnVisible', () => {
  it('refreshes when the page becomes visible, not when hidden', () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnVisible(refresh));
    setVisibility('hidden');
    expect(refresh).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on back/forward cache restore only', () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnVisible(refresh));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(refresh).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
