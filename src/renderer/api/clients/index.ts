/**
 * Barrel export para clientes de API
 */
export type { IApiClient } from './IApiClient';
export { SqliteClient } from './SqliteClient';
export { SupabaseClient } from './SupabaseClient';
export * from './supabaseConfig';
export { getQueryCount, getCacheHitCount, resetQueryCount } from './queryCounter';
