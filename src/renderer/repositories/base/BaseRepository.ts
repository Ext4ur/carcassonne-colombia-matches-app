/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRepository } from './IRepository';
import { IApiClient } from '@api/clients/IApiClient';

/**
 * Clase base abstracta para todos los repositorios
 * Implementa las operaciones CRUD básicas usando un IApiClient
 */
export abstract class BaseRepository<T> implements IRepository<T> {
  protected abstract tableName: string;
  protected abstract apiClient: IApiClient;

  /**
   * Obtener todos los registros, opcionalmente filtrados
   */
  async findAll(filters?: any): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filters) {
      const conditions = this.buildWhereClause(filters, params);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ` ORDER BY id DESC`;

    return this.apiClient.query<T>(sql, params);
  }

  /**
   * Obtener un registro por su ID
   */
  async findById(id: number): Promise<T | null> {
    const results = await this.apiClient.query<T>(`SELECT * FROM ${this.tableName} WHERE id = ?`, [
      id,
    ]);
    return results[0] || null;
  }

  /**
   * Crear un nuevo registro
   */
  async create(data: Partial<T>): Promise<number> {
    const { columns, values, params } = this.buildInsertData(data);
    if (columns.length === 0) {
      throw new Error('No data provided for insert');
    }

    const result = await this.apiClient.execute(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
      params
    );
    return result.lastInsertRowid;
  }

  /**
   * Actualizar un registro existente
   */
  async update(id: number, data: Partial<T>): Promise<void> {
    const { updates, params } = this.buildUpdateData(data);
    if (updates.length === 0) return;

    params.push(id);
    await this.apiClient.execute(
      `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  /**
   * Eliminar un registro
   */
  async delete(id: number): Promise<void> {
    await this.apiClient.execute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  /**
   * Contar registros, opcionalmente filtrados
   */
  async count(filters?: any): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (filters) {
      const conditions = this.buildWhereClause(filters, params);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    const results = await this.apiClient.query<{ count: number }>(sql, params);
    return results[0]?.count || 0;
  }

  /**
   * Construir cláusula WHERE a partir de filtros
   */
  protected buildWhereClause(filters: any, params: any[]): string[] {
    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }
    return conditions;
  }

  /**
   * Construir datos para INSERT
   */
  protected buildInsertData(data: Partial<T>): {
    columns: string[];
    values: string[];
    params: any[];
  } {
    const columns: string[] = [];
    const values: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        columns.push(key);
        values.push('?');
        params.push(value);
      }
    }

    return { columns, values, params };
  }

  /**
   * Construir datos para UPDATE
   */
  protected buildUpdateData(data: Partial<T>): { updates: string[]; params: any[] } {
    const updates: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }

    return { updates, params };
  }
}
