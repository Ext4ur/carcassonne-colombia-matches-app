/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cliente para acceder a SQLite a través de Electron IPC.
 */
export class SqliteClient {
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.query(sql, params);
  }

  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.execute(sql, params);
  }

  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.transaction(queries);
  }
}
