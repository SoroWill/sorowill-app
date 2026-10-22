// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DASHBOARD_TAB_KEY, loadDashboardTab, saveDashboardTab } from '@/lib/dashboardTab';

describe('dashboard tab persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to owned', () => {
    expect(loadDashboardTab()).toBe('owned');
  });

  it('restores the saved tab after a reload', () => {
    saveDashboardTab('guardianship');
    expect(window.localStorage.getItem(DASHBOARD_TAB_KEY)).toBe('guardianship');
    expect(loadDashboardTab()).toBe('guardianship');
  });

  it('ignores invalid stored values', () => {
    window.localStorage.setItem(DASHBOARD_TAB_KEY, 'bogus');
    expect(loadDashboardTab()).toBe('owned');
  });
});
