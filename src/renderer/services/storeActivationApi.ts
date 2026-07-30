import { SupabaseClient } from '../api/clients/SupabaseClient';
import { isRemoteSyncReady } from '../api/clients/supabaseConfig';
import type { StoreActivationMode, StoreActivationState } from './storeActivation';
import { setStoreActivation } from './storeActivation';

export type RedeemActivationResult = {
  ok: true;
  state: StoreActivationState;
};

export type RedeemActivationError = {
  ok: false;
  message: string;
};

const supabase = new SupabaseClient();

export async function redeemStoreActivation(
  code: string,
  fingerprint: string
): Promise<RedeemActivationResult | RedeemActivationError> {
  if (!isRemoteSyncReady()) {
    return {
      ok: false,
      message: 'store_activation.errors.sync_not_configured',
    };
  }

  const client = supabase.client;
  if (!client) {
    return { ok: false, message: 'store_activation.errors.sync_not_configured' };
  }

  const email = import.meta.env.VITE_SUPABASE_SYNC_EMAIL;
  const password = import.meta.env.VITE_SUPABASE_SYNC_PASSWORD;
  if (email && password) {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      const { error: authError } = await client.auth.signInWithPassword({ email, password });
      if (authError) {
        return { ok: false, message: 'store_activation.errors.auth_failed' };
      }
    }
  }

  const normalized = code.trim().toUpperCase();
  const { data, error } = await client.rpc('redeem_store_activation', {
    p_code: normalized,
    p_fingerprint: fingerprint,
  });

  if (error) {
    console.error('redeem_store_activation:', error);
    return { ok: false, message: 'store_activation.errors.redeem_failed' };
  }

  const row = data as {
    success?: boolean;
    error?: string;
    tournament_uuid?: string;
    place_name?: string;
    mode?: StoreActivationMode;
    code?: string;
  } | null;

  if (!row?.success || !row.tournament_uuid || !row.mode) {
    const errKey = row?.error ?? 'store_activation.errors.invalid_code';
    return { ok: false, message: errKey };
  }

  const state: StoreActivationState = {
    code: row.code ?? normalized,
    tournament_uuid: row.tournament_uuid,
    place_name: row.place_name ?? undefined,
    mode: row.mode,
  };
  setStoreActivation(state);
  return { ok: true, state };
}
