/**
 * Minimal HTML escaping for values interpolated into the small status pages
 * and email templates this app sends. Kept separate from the reminder store so
 * route handlers can render a page without pulling in the whole store (and so
 * tests can mock the store without losing the escaping).
 */
export function escapeHtml(value: string): string {
  if (typeof value !== 'string') {
    value = String(value);
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
