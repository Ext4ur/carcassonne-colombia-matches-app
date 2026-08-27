import { isStoreMode } from '../utils/appMode';

export type StoreActivationMode = 'manage' | 'join' | 'readonly';

export type StoreActivationState = {
  code: string;
  tournament_uuid: string;
  place_name?: string;
  mode: StoreActivationMode;
};

const STORAGE_KEY = 'store_activation';
const FINGERPRINT_KEY = 'store_machine_fingerprint';

export function getStoreActivation(): StoreActivationState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as StoreActivationState;
    if (!parsed?.code || !parsed?.tournament_uuid || !parsed?.mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoreActivation(state: StoreActivationState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAssignedTournamentUuid(): string | null {
  if (!isStoreMode()) return null;
  return getStoreActivation()?.tournament_uuid ?? null;
}

export function getMachineFingerprint(): string {
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    fp = `fp-${crypto.randomUUID()}`;
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}
