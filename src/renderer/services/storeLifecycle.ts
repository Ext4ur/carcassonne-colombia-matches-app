import { isStoreMode } from '../utils/appMode';

const KIOSK_LOCKED_KEY = 'store_kiosk_locked';

export function isStoreKioskLockedFlag(): boolean {
  if (!isStoreMode()) return false;
  return localStorage.getItem(KIOSK_LOCKED_KEY) === 'true';
}

export function setStoreKioskLocked(): void {
  if (!isStoreMode()) return;
  localStorage.setItem(KIOSK_LOCKED_KEY, 'true');
}

export function clearStoreKioskLocked(): void {
  localStorage.removeItem(KIOSK_LOCKED_KEY);
}

type StoreTournamentRow = { type?: string; status?: string };

function storeQualifiers(tournaments: StoreTournamentRow[]): StoreTournamentRow[] {
  return tournaments.filter((t) => t.type === 'qualifier');
}

/** Tienda kiosk: solo puede crear si no hay clasificatorios y no hay uno finalizado. */
export function canCreateStoreTournament(tournaments: StoreTournamentRow[]): boolean {
  if (!isStoreMode()) return true;
  const qualifiers = storeQualifiers(tournaments);
  if (qualifiers.some((t) => t.status === 'completed')) return false;
  if (qualifiers.length > 0) return false;
  if (isStoreKioskLockedFlag()) clearStoreKioskLocked();
  return true;
}

export function isStoreTournamentReadOnly(status?: string | null): boolean {
  if (!isStoreMode()) return false;
  if (isStoreKioskLockedFlag()) return true;
  return status === 'completed';
}

/** En tienda: listar torneos locales sin filtro por código de activación. */
export function filterTournamentsForStoreKiosk<T extends { type?: string }>(tournaments: T[]): T[] {
  if (!isStoreMode()) return tournaments;
  return tournaments.filter((t) => t.type === 'qualifier');
}

export function canEditStoreTournament(status?: string | null): boolean {
  if (!isStoreMode()) return true;
  return !isStoreTournamentReadOnly(status);
}
