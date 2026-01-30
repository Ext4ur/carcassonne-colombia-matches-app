/* eslint-disable @typescript-eslint/no-explicit-any */
import { IApiClient } from './IApiClient';
import { SqliteClient } from './SqliteClient';
import { SupabaseClient } from './SupabaseClient';
import { DB_CONFIG } from '../../constants';
import { isSupabaseConfigured } from './supabaseConfig';
import { incrementQueryCount } from './queryCounter';

/**
 * Wrapper que cuenta cada query/execute para validar y optimizar peticiones.
 * Expone _client para que DatabaseService pueda acceder al cliente real (ej. SupabaseClient.client).
 */
function wrapWithQueryCounter(client: IApiClient): IApiClient & { _client?: IApiClient } {
  const wrapped = {
    async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
      incrementQueryCount();
      return client.query<T>(sql, params);
    },
    async execute(
      sql: string,
      params?: any[]
    ): Promise<{ lastInsertRowid: number; changes: number }> {
      incrementQueryCount();
      return client.execute(sql, params);
    },
    async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
      incrementQueryCount();
      return client.transaction(queries);
    },
    _client: client,
  };
  return wrapped;
}

/**
 * Factory para crear clientes de API según la configuración
 */
export function createApiClient(): IApiClient {
  const mode = DB_CONFIG.mode;
  let client: IApiClient;

  if (mode === 'remote') {
    // Modo remoto: usar Supabase
    if (!isSupabaseConfigured()) {
      console.warn('Supabase no está configurado, usando SQLite como fallback');
      client = new SqliteClient();
    } else {
      client = new SupabaseClient();
    }
  } else if (mode === 'dual') {
    // Modo dual: por ahora usar SQLite hasta que implementemos DualRepository
    // TODO: En Sprint 3 implementaremos DualRepository
    console.log('Modo dual configurado, usando SQLite por ahora (DualRepository pendiente)');
    client = new SqliteClient();
  } else {
    // Modo local: usar SQLite
    client = new SqliteClient();
  }

  return wrapWithQueryCounter(client);
}

/**
 * Obtener el cliente de API actual
 */
let apiClientInstance: IApiClient | null = null;

export function getApiClient(): IApiClient {
  if (!apiClientInstance) {
    apiClientInstance = createApiClient();
  }
  return apiClientInstance;
}

/**
 * Resetear el cliente (útil para cambiar de modo en runtime)
 */
export function resetApiClient(): void {
  apiClientInstance = null;
}
