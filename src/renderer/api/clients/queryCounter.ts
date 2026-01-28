/**
 * Contador de queries para validar y optimizar el número de peticiones a la BD.
 * - Queries directas: cada query() y execute() que llega al cliente (Supabase/SQLite).
 * - Cache hits: lecturas satisfechas por dbCache sin tocar la BD.
 */

let queryCount = 0;
let cacheHitCount = 0;

export function getQueryCount(): number {
  return queryCount;
}

export function incrementQueryCount(): void {
  queryCount += 1;
}

export function getCacheHitCount(): number {
  return cacheHitCount;
}

export function incrementCacheHitCount(): void {
  cacheHitCount += 1;
}

export function resetQueryCount(): void {
  queryCount = 0;
  cacheHitCount = 0;
}
