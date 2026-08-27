import { createClient, SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
  getConfigError,
} from './supabaseConfig';

/**
 * Thin wrapper around supabase-js: auth session for sync + direct `.client` access.
 */
export class SupabaseClient {
  private _client: SupabaseJSClient | null = null;
  private _authReady: Promise<void> | null = null;

  get client(): SupabaseJSClient | null {
    return this._client;
  }

  constructor() {
    if (isSupabaseConfigured()) {
      this._client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    } else {
      console.warn('Supabase no está configurado:', getConfigError());
    }
  }

  /** Asegura sesión Supabase Auth del usuario sync (requerido para RLS 029+). */
  async ensureSyncSession(): Promise<void> {
    if (!this._client) return;
    if (this._authReady) {
      await this._authReady;
      return;
    }

    this._authReady = (async () => {
      const {
        data: { session },
      } = await this._client!.auth.getSession();
      if (session) return;

      const email = import.meta.env.VITE_SUPABASE_SYNC_EMAIL;
      const password = import.meta.env.VITE_SUPABASE_SYNC_PASSWORD;
      if (!email || !password) {
        throw new Error(
          'Sync remoto requiere VITE_SUPABASE_SYNC_EMAIL y VITE_SUPABASE_SYNC_PASSWORD'
        );
      }

      const { error } = await this._client!.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(`Error de autenticación Supabase: ${error.message}`);
      }
    })();

    try {
      await this._authReady;
    } catch (err) {
      this._authReady = null;
      throw err;
    }
  }
}
