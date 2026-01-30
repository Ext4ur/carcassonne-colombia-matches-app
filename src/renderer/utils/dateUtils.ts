/**
 * Returns the current local date in YYYY-MM-DD format.
 * Use this instead of new Date().toISOString().split('T')[0] when you need
 * "today" in the user's timezone (e.g. default tournament date).
 * toISOString() uses UTC, so in timezones behind UTC the default could be wrong.
 */
export function getLocalDateString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Normalizes an ISO or YYYY-MM-DD date string and returns DD/MM/YYYY for display.
 * Returns '-' if the value is null, undefined or empty.
 */
export function formatDateForDisplay(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return '-';
  const isoDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  return isoDate.split('-').reverse().join('/');
}
