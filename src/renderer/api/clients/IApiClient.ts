/**
 * Interface para clientes de API de base de datos
 * Permite abstraer el acceso a SQLite (local) o Supabase (remoto)
 */
export interface IApiClient {
  /**
   * Ejecutar una query SELECT y retornar resultados
   * @param sql - Query SQL
   * @param params - Parámetros opcionales para la query
   * @returns Array de resultados
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Ejecutar una query INSERT, UPDATE o DELETE
   * @param sql - Query SQL
   * @param params - Parámetros opcionales para la query
   * @returns Información sobre la operación (lastInsertRowid, changes)
   */
  execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }>;

  /**
   * Ejecutar múltiples queries en una transacción
   * @param queries - Array de queries a ejecutar
   * @returns Array de resultados de cada query
   */
  transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]>;
}
