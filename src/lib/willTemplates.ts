/**
 * Will templates (#890): pre-configured distributions and timings that pre-fill the new-will
 * form. A template never contains addresses: only labelled shares and the check-in/grace
 * periods. Users fill in the addresses, so templates are safe to share.
 */

export const CUSTOM_TEMPLATES_KEY = 'sorowill:will-templates:v1';
export const MAX_CUSTOM_TEMPLATES = 20;

export interface TemplateShare {
  /** Who this share is for, e.g. "Spouse" (a hint for the user, not stored on-chain). */
  label: string;
  /** Whole percentage. */
  percentage: number;
}

export interface WillTemplate {
  id: string;
  name: string;
  description: string;
  shares: TemplateShare[];
  checkinPeriodDays: number;
  gracePeriodDays: number;
  builtIn?: boolean;
}

export const BUILT_IN_TEMPLATES: WillTemplate[] = [
  {
    id: 'single-heir',
    name: 'Single heir',
    description: 'Everything to one person.',
    shares: [{ label: 'Heir', percentage: 100 }],
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    builtIn: true,
  },
  {
    id: 'two-equal',
    name: 'Two equal heirs',
    description: 'Split evenly between two people, for example two children.',
    shares: [
      { label: 'First heir', percentage: 50 },
      { label: 'Second heir', percentage: 50 },
    ],
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    builtIn: true,
  },
  {
    id: 'spouse-and-children',
    name: 'Spouse and two children',
    description: 'Half to a spouse, the rest split between two children.',
    shares: [
      { label: 'Spouse', percentage: 50 },
      { label: 'Child 1', percentage: 25 },
      { label: 'Child 2', percentage: 25 },
    ],
    checkinPeriodDays: 90,
    gracePeriodDays: 14,
    builtIn: true,
  },
  {
    id: 'family-and-charity',
    name: 'Family with a charity gift',
    description: '90% to family, 10% to a charity.',
    shares: [
      { label: 'Family member', percentage: 90 },
      { label: 'Charity', percentage: 10 },
    ],
    checkinPeriodDays: 180,
    gracePeriodDays: 14,
    builtIn: true,
  },
];

/** Problems that make a template unusable, or [] when valid. */
export function validateTemplate(t: Pick<WillTemplate, 'name' | 'shares' | 'checkinPeriodDays' | 'gracePeriodDays'>): string[] {
  const errors: string[] = [];
  if (!t.name.trim()) errors.push('Give the template a name.');
  if (t.shares.length === 0) errors.push('Add at least one share.');
  if (t.shares.some((s) => !Number.isInteger(s.percentage) || s.percentage < 1 || s.percentage > 100)) {
    errors.push('Each share must be a whole percentage between 1 and 100.');
  }
  const total = t.shares.reduce((sum, s) => sum + s.percentage, 0);
  if (total !== 100) errors.push(`Shares must add up to 100% (currently ${total}%).`);
  if (!Number.isInteger(t.checkinPeriodDays) || t.checkinPeriodDays < 1) errors.push('Check-in period must be at least 1 day.');
  if (!Number.isInteger(t.gracePeriodDays) || t.gracePeriodDays < 1) errors.push('Grace period must be at least 1 day.');
  return errors;
}

function isTemplate(value: unknown): value is WillTemplate {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<WillTemplate>;
  return (
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.description === 'string' &&
    Array.isArray(t.shares) &&
    t.shares.every((s) => s && typeof s.label === 'string' && typeof s.percentage === 'number') &&
    typeof t.checkinPeriodDays === 'number' &&
    typeof t.gracePeriodDays === 'number'
  );
}

export function loadCustomTemplates(): WillTemplate[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_TEMPLATES_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isTemplate).map((t) => ({ ...t, builtIn: false })) : [];
  } catch {
    return [];
  }
}

function saveCustom(templates: WillTemplate[]): void {
  try {
    window.localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // Storage unavailable: the template still applies to the current form.
  }
}

/** Saves (or replaces, by name) a custom template. Returns the errors, or [] on success. */
export function saveCustomTemplate(
  template: Omit<WillTemplate, 'id' | 'builtIn'>,
  makeId: () => string = () => `custom-${Date.now().toString(36)}`,
): string[] {
  const errors = validateTemplate(template);
  if (errors.length) return errors;
  const existing = loadCustomTemplates();
  const sameName = existing.find((t) => t.name.trim().toLowerCase() === template.name.trim().toLowerCase());
  if (!sameName && existing.length >= MAX_CUSTOM_TEMPLATES) {
    return [`You can save up to ${MAX_CUSTOM_TEMPLATES} templates. Delete one first.`];
  }
  const saved: WillTemplate = { ...template, name: template.name.trim(), id: sameName?.id ?? makeId() };
  saveCustom(sameName ? existing.map((t) => (t.id === sameName.id ? saved : t)) : [...existing, saved]);
  return [];
}

export function deleteCustomTemplate(id: string): void {
  saveCustom(loadCustomTemplates().filter((t) => t.id !== id));
}

/** Compact, URL-safe encoding of a template for share links (`/will/new?template=…`). */
export function encodeTemplate(t: WillTemplate): string {
  const payload = JSON.stringify({ n: t.name, d: t.description, s: t.shares.map((s) => [s.label, s.percentage]), c: t.checkinPeriodDays, g: t.gracePeriodDays });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes a shared template; returns null when the value is malformed or invalid. */
export function decodeTemplate(encoded: string): WillTemplate | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as { n: unknown; d: unknown; s: unknown; c: unknown; g: unknown };
    if (typeof p.n !== 'string' || !Array.isArray(p.s)) return null;
    const template: WillTemplate = {
      id: 'shared',
      name: p.n.slice(0, 60),
      description: typeof p.d === 'string' ? p.d.slice(0, 200) : '',
      shares: p.s
        .filter((s): s is [string, number] => Array.isArray(s) && typeof s[0] === 'string' && typeof s[1] === 'number')
        .map(([label, percentage]) => ({ label: label.slice(0, 40), percentage })),
      checkinPeriodDays: Number(p.c),
      gracePeriodDays: Number(p.g),
    };
    return validateTemplate(template).length === 0 ? template : null;
  } catch {
    return null;
  }
}

export function templateShareUrl(t: WillTemplate, origin: string): string {
  return `${origin}/will/new?template=${encodeTemplate(t)}`;
}
