// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DASHBOARD_TAB_KEY, loadDashboardTab, saveDashboardTab } from '@/lib/dashboardTab';
import {
  DASHBOARD_FILTERS_KEY,
  clearDashboardFilters,
  loadDashboardFilters,
  saveDashboardFilters,
} from '@/lib/dashboardTab';

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

describe('dashboard filter persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults when storage is empty', () => {
    expect(loadDashboardFilters()).toEqual({});
  });

  it('defaults when stored value is invalid', () => {
    window.localStorage.setItem(DASHBOARD_FILTERS_KEY, 'not-json');
    expect(loadDashboardFilters()).toEqual({});
  });

  it('defaults when stored value is not an object', () => {
    window.localStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify('bogus'));
    expect(loadDashboardFilters()).toEqual({});
  });

  it('saves filters to the expected key', () => {
    const filters = { status: 'active', search: 'abc' };
    saveDashboardFilters(filters);
    expect(window.localStorage.getItem(DASHBOARD_FILTERS_KEY)).toBe(JSON.stringify(filters));
  });

  it('clears saved filters', () => {
    saveDashboardFilters({ status: 'active' });
    clearDashboardFilters();
    expect(window.localStorage.getItem(DASHBOARD_FILTERS_KEY)).toBeNull();
    expect(loadDashboardFilters()).toEqual({});
  });

  it('round-trips filters after save', () => {
    const filters = { status: 'active', search: 'abc' };
    saveDashboardFilters(filters);
    expect(loadDashboardFilters()).toEqual(filters);
  });
});