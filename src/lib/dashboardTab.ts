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

/** localStorage key the dashboard persists its filter state under. */
export const DASHBOARD_FILTERS_KEY = 'sorowill_dashboard_filters';

export type DashboardFilterStatus = 'all' | 'active' | 'pending' | 'completed';

export interface DashboardFilters {
  status: DashboardFilterStatus;
  search: string;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  status: 'all',
  search: '',
};

const FILTER_STATUSES: readonly DashboardFilterStatus[] = [
  'all',
  'active',
  'pending',
  'completed',
];

function isDashboardFilterStatus(value: unknown): value is DashboardFilterStatus {
  return typeof value === 'string' && FILTER_STATUSES.some((s) => s === value);
}

export function loadDashboardFilters(): DashboardFilters {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_FILTERS_KEY);
    if (!stored) return { ...DEFAULT_DASHBOARD_FILTERS };

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_DASHBOARD_FILTERS };
    }

    const record = parsed as Record<string, unknown>;
    return {
      status: isDashboardFilterStatus(record.status)
        ? record.status
        : DEFAULT_DASHBOARD_FILTERS.status,
      search:
        typeof record.search === 'string'
          ? record.search
          : DEFAULT_DASHBOARD_FILTERS.search,
    };
  } catch {
    return { ...DEFAULT_DASHBOARD_FILTERS };
  }
}

export function saveDashboardFilters(filters: DashboardFilters): void {
  try {
    window.localStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Storage unavailable (private mode, quota); persistence is best-effort.
  }
}

export function clearDashboardFilters(): void {
  try {
    window.localStorage.removeItem(DASHBOARD_FILTERS_KEY);
  } catch {
    // Storage unavailable (private mode, quota); persistence is best-effort.
  }
}