/**
 * Automated compliance reporting (#912).
 *
 * Builds a compliance report from the will data the app already has, keeps an
 * append-only audit trail of who generated or downloaded a report, and stores
 * both in the same KV store the reminder subscriptions use. The report is
 * deterministic for a given input so a stored report can be re-verified by
 * hashing it again.
 */

import { createHash, randomUUID } from 'node:crypto';

export type ComplianceStatus = 'compliant' | 'attention' | 'non_compliant';

export interface ComplianceWillInput {
  id: string;
  owner?: string;
  /** Beneficiary allocations in basis points; must total 10,000. */
  allocations?: ReadonlyArray<{ address: string; basisPoints: number }>;
  /** Epoch seconds of the last check-in, when known. */
  lastCheckin?: number;
  /** Epoch seconds of the next deadline, when known. */
  nextDeadline?: number;
  guardians?: ReadonlyArray<string>;
  /** Whether the owner has confirmed the will on chain. */
  confirmed?: boolean;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ComplianceReport {
  id: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  status: ComplianceStatus;
  checks: ComplianceCheck[];
  summary: {
    wills: number;
    compliant: number;
    attention: number;
    nonCompliant: number;
  };
  /** SHA-256 of the canonical report body, so a download can be verified. */
  digest: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: 'report.generated' | 'report.downloaded';
  reportId: string;
  actor: string;
  correlationId?: string;
}

export interface ComplianceStore {
  reports: Record<string, ComplianceReport>;
  audit: AuditEntry[];
}

export const TOTAL_BASIS_POINTS = 10_000;
const MAX_AUDIT_ENTRIES = 1_000;

export function emptyComplianceStore(): ComplianceStore {
  return { reports: {}, audit: [] };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 over the canonical JSON of the report, excluding the digest itself. */
export function digestReport(report: Omit<ComplianceReport, 'digest'>): string {
  return createHash('sha256').update(canonical(report)).digest('hex');
}

function checkWill(will: ComplianceWillInput): ComplianceCheck[] {
  const allocations = will.allocations ?? [];
  const total = allocations.reduce((sum, a) => sum + a.basisPoints, 0);
  const unique = new Set(allocations.map((a) => a.address)).size === allocations.length;

  return [
    {
      id: 'beneficiaries.total',
      label: 'Beneficiary allocations total 100%',
      passed: allocations.length > 0 && total === TOTAL_BASIS_POINTS,
      detail: `Will ${will.id}: ${total} of ${TOTAL_BASIS_POINTS} basis points allocated.`,
    },
    {
      id: 'beneficiaries.unique',
      label: 'Beneficiary addresses are unique',
      passed: unique,
      detail: `Will ${will.id}: ${allocations.length} allocation(s), ${unique ? 'no' : 'duplicate'} addresses.`,
    },
    {
      id: 'guardians.present',
      label: 'At least one guardian is configured',
      passed: (will.guardians?.length ?? 0) > 0,
      detail: `Will ${will.id}: ${will.guardians?.length ?? 0} guardian(s).`,
    },
    {
      id: 'will.confirmed',
      label: 'Will is confirmed on chain',
      passed: will.confirmed === true,
      detail: `Will ${will.id} is ${will.confirmed ? '' : 'not '}confirmed.`,
    },
  ];
}

function statusFor(checks: ComplianceCheck[]): ComplianceStatus {
  const failed = checks.filter((c) => !c.passed).length;
  if (failed === 0) return 'compliant';
  return failed === 1 ? 'attention' : 'non_compliant';
}

/**
 * Builds a report for the given wills over `[periodStart, periodEnd]`.
 * `now` is injectable so the output is reproducible in tests.
 */
export function generateComplianceReport(
  wills: ReadonlyArray<ComplianceWillInput>,
  options: { periodStart: Date; periodEnd: Date; now?: Date; id?: string },
): ComplianceReport {
  const now = options.now ?? new Date();
  const checks = wills.flatMap(checkWill);
  const status = statusFor(checks);
  const body: Omit<ComplianceReport, 'digest'> = {
    id: options.id ?? `cr_${randomUUID()}`,
    generatedAt: now.toISOString(),
    periodStart: options.periodStart.toISOString(),
    periodEnd: options.periodEnd.toISOString(),
    status,
    checks,
    summary: {
      wills: wills.length,
      compliant: status === 'compliant' ? wills.length : 0,
      attention: status === 'attention' ? wills.length : 0,
      nonCompliant: status === 'non_compliant' ? wills.length : 0,
    },
  };
  return { ...body, digest: digestReport(body) };
}

/** Appends an audit entry, keeping the trail bounded and newest-last. */
export function appendAudit(
  store: ComplianceStore,
  entry: Omit<AuditEntry, 'id' | 'at'> & { at?: Date },
): AuditEntry {
  const at = (entry.at ?? new Date()).toISOString();
  const record: AuditEntry = {
    id: `au_${randomUUID()}`,
    at,
    action: entry.action,
    reportId: entry.reportId,
    actor: entry.actor,
    correlationId: entry.correlationId,
  };
  store.audit.push(record);
  if (store.audit.length > MAX_AUDIT_ENTRIES) {
    store.audit.splice(0, store.audit.length - MAX_AUDIT_ENTRIES);
  }
  return record;
}

/** Renders a report as CSV for download. */
export function reportToCsv(report: ComplianceReport): string {
  const rows = [
    ['report_id', 'generated_at', 'period_start', 'period_end', 'status', 'digest'],
    [report.id, report.generatedAt, report.periodStart, report.periodEnd, report.status, report.digest],
    [],
    ['check_id', 'label', 'passed', 'detail'],
    ...report.checks.map((c) => [c.id, c.label, String(c.passed), c.detail]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

const KV_KEY = () => process.env.COMPLIANCE_STORE_KV_KEY || 'sorowill:compliance-store';

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Reads the compliance store; falls back to an empty store when KV is unset. */
export async function readComplianceStore(): Promise<ComplianceStore> {
  const config = kvConfig();
  if (!config) return emptyComplianceStore();
  const response = await fetch(`${config.url}/get/${encodeURIComponent(KV_KEY())}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Failed to read compliance store: ${response.status}`);
  const payload = (await response.json()) as { result: string | null };
  if (!payload.result) return emptyComplianceStore();
  const parsed = JSON.parse(payload.result) as Partial<ComplianceStore>;
  return { reports: parsed.reports ?? {}, audit: parsed.audit ?? [] };
}

export async function writeComplianceStore(store: ComplianceStore): Promise<void> {
  const config = kvConfig();
  if (!config) throw new Error('KV configuration missing');
  const response = await fetch(`${config.url}/set/${encodeURIComponent(KV_KEY())}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(store),
  });
  if (!response.ok) throw new Error(`Failed to write compliance store: ${response.status}`);
}
