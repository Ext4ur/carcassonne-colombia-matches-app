/* eslint-disable @typescript-eslint/no-explicit-any */
import { IApiClient } from './IApiClient';

/**
 * Cliente para acceder a SQLite a través de Electron IPC
 * Implementa IApiClient para abstraer el acceso a la base de datos local
 */
export class SqliteClient implements IApiClient {
  /**
   * Ejecutar una query SELECT y retornar resultados
   * @param sql - Query SQL
   * @param params - Parámetros opcionales para la query
   * @returns Array de resultados
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.query(sql, params);
  }

  /**
   * Ejecutar una query INSERT, UPDATE o DELETE
   * @param sql - Query SQL
   * @param params - Parámetros opcionales para la query
   * @returns Información sobre la operación (lastInsertRowid, changes)
   */
  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.execute(sql, params);
  }

  /**
   * Ejecutar múltiples queries en una transacción
   * @param queries - Array de queries a ejecutar
   * @returns Array de resultados de cada query
   */
  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.transaction(queries);
  }
}
