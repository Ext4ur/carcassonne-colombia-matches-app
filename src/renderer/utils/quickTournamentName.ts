/**
 * Builds the default quick-tournament name: "{place} - {date}" (ISO YYYY-MM-DD).
 */
export function buildQuickTournamentName(placeName: string, date: string): string {
  const place = placeName.trim();
  const d = date.trim();
  if (place && d) return `${place} - ${d}`;
  if (place) return place;
  if (d) return d;
  return '';
}
