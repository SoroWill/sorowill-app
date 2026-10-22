export type DashboardTab = 'owned' | 'inheriting' | 'guardianship';

/** localStorage key the dashboard persists its selected tab under. */
export const DASHBOARD_TAB_KEY = 'sorowill_dashboard_tab';

const TABS: readonly DashboardTab[] = ['owned', 'inheriting', 'guardianship'];

export function loadDashboardTab(): DashboardTab {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_TAB_KEY);
    return TABS.find((t) => t === stored) ?? 'owned';
  } catch {
    return 'owned';
  }
}

export function saveDashboardTab(tab: DashboardTab): void {
  try {
    window.localStorage.setItem(DASHBOARD_TAB_KEY, tab);
  } catch {
    // Storage unavailable (private mode, quota); persistence is best-effort.
  }
}
