import { createClient, SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { IApiClient } from './IApiClient';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
  getConfigError,
} from './supabaseConfig';

/**
 * Cliente de Supabase que implementa IApiClient
 *
 * Convierte las operaciones SQL genéricas a las operaciones específicas de Supabase
 */
export class SupabaseClient implements IApiClient {
  private _client: SupabaseJSClient | null = null;

  /** Expuesto para DatabaseService cuando necesita el cliente Supabase directo (ej. .from().select()). */
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

  /**
   * Ejecutar una query SELECT
   *
   * Convierte SQL genérico a operaciones de Supabase.
   * Por ahora, soporta queries simples como:
   * - SELECT * FROM table WHERE condition
   * - SELECT columns FROM table
   * - SELECT COUNT(*) FROM table
   *
   * TODO: En el futuro, podríamos usar RPC para queries más complejas
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this._client) {
      throw new Error('Supabase no está configurado. ' + getConfigError());
    }

    try {
      // Parsear SQL básico para extraer tabla y condiciones
      const parsed = this.parseSelectQuery(sql, params);

      // Si es una query COUNT(*), usar el método count() de Supabase
      if (parsed.isCount) {
        const countQuery = this._client
          .from(parsed.table)
          .select('*', { count: 'exact', head: true });

        // Aplicar filtros WHERE si existen
        if (parsed.where && Object.keys(parsed.where).length > 0) {
          // Para COUNT con WHERE, necesitamos hacer un select normal y contar los resultados
          let dataQuery = this._client.from(parsed.table).select('*', { count: 'exact' });

          // Aplicar filtros
          Object.entries(parsed.where).forEach(([key, value]) => {
            dataQuery = dataQuery.eq(key, value);
          });

          const { count, error } = await dataQuery;

          if (error) {
            throw new Error(`Supabase query error: ${error.message}`);
          }

          return [{ count: count || 0 }] as T[];
        } else {
          const { count, error } = await countQuery;

          if (error) {
            throw new Error(`Supabase query error: ${error.message}`);
          }

          return [{ count: count || 0 }] as T[];
        }
      }

      // Query normal SELECT
      // Si tiene JOIN, necesitamos usar una estrategia diferente
      if (parsed.hasJoin && parsed.joinTable) {
        // Para JOINs, usamos el método select con relaciones de Supabase
        // Parsear columnas con alias (ej: t.*, c.name as circuit_name)
        const originalColumns = parsed.columns || '*';

        // Detectar si hay alias de columna (ej: c.name as circuit_name)
        // Buscar en todas las columnas separadas por coma
        const columnParts = originalColumns.split(',').map((c) => c.trim());
        let joinColumnName: string | null = null;
        let joinColumnAlias: string | null = null;

        for (const col of columnParts) {
          const aliasMatch = col.match(/(\w+)\.(\w+)\s+as\s+(\w+)/i);
          if (aliasMatch) {
            const tableAlias = aliasMatch[1].toLowerCase();
            const columnName = aliasMatch[2];
            const columnAlias = aliasMatch[3];

            // Si el alias de tabla es 'c' (circuits), es de la tabla JOIN
            if (tableAlias === 'c' || tableAlias === parsed.joinTable[0]?.toLowerCase()) {
              joinColumnName = columnName;
              joinColumnAlias = columnAlias;
              break;
            }
          }
        }

        // Construir el select de Supabase con relación
        // Supabase usa la sintaxis: select('*, related_table(column)')
        // Nota: El nombre de la relación en Supabase es el nombre de la tabla relacionada
        // Para tournaments -> circuits (via circuit_id), la relación se llama 'circuits'
        let selectStr = '*'; // Siempre seleccionar todas las columnas de la tabla principal

        // Agregar relación. En Supabase, cuando hay una foreign key, la relación se llama por el nombre de la tabla
        if (joinColumnName) {
          // Si hay una columna específica con alias, seleccionarla
          selectStr += `,${parsed.joinTable}(${joinColumnName})`;
        } else {
          // Si no, seleccionar todas las columnas de la relación
          selectStr += `,${parsed.joinTable}(*)`;
        }

        let query = this._client.from(parsed.table).select(selectStr);

        // Aplicar filtros WHERE
        if (parsed.where && Object.keys(parsed.where).length > 0) {
          Object.entries(parsed.where).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }

        // Aplicar ordenamiento (solo el primero por ahora)
        if (parsed.orderBy) {
          // Remover prefijo de tabla si existe (ej: t.date -> date)
          const orderColumn = parsed.orderBy.column.includes('.')
            ? parsed.orderBy.column.split('.')[1]
            : parsed.orderBy.column;
          query = query.order(orderColumn, { ascending: parsed.orderBy.ascending });
        }

        // Aplicar límite
        if (parsed.limit) {
          query = query.limit(parsed.limit);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query error: ${error.message}`);
        }

        // Transformar los datos para que coincidan con el formato esperado
        // Supabase retorna relaciones como objetos anidados
        const transformedData = (data || []).map((item: any) => {
          const result: any = { ...item };

          // Si hay una relación, aplanarla
          if (item[parsed.joinTable!]) {
            const joinData = Array.isArray(item[parsed.joinTable!])
              ? item[parsed.joinTable!][0]
              : item[parsed.joinTable!];

            if (joinData) {
              // Si hay un alias específico (ej: circuit_name)
              if (joinColumnAlias && joinColumnName) {
                result[joinColumnAlias] = joinData[joinColumnName];
              } else if (joinColumnName) {
                result[joinColumnName] = joinData[joinColumnName];
              }
            }

            // Eliminar el objeto anidado
            delete result[parsed.joinTable!];
          }

          return result;
        });

        const result = parsed.hadDistinct ? this.deduplicateRows(transformedData) : transformedData;
        return result as T[];
      }

      // Query sin JOIN
      let query = this._client.from(parsed.table).select(parsed.columns || '*');

      // Aplicar filtros WHERE
      if (parsed.where && Object.keys(parsed.where).length > 0) {
        Object.entries(parsed.where).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      // Aplicar ordenamiento
      if (parsed.orderBy) {
        query = query.order(parsed.orderBy.column, { ascending: parsed.orderBy.ascending });
      }

      // Aplicar límite
      if (parsed.limit) {
        query = query.limit(parsed.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Supabase query error: ${error.message}`);
      }

      const rows = (data || []) as T[];
      const result = parsed.hadDistinct ? this.deduplicateRows(rows) : rows;
      return result;
    } catch (error: any) {
      console.error('Error en Supabase query:', error);
      throw error;
    }
  }

  /**
   * Ejecutar INSERT, UPDATE o DELETE
   */
  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!this._client) {
      throw new Error('Supabase no está configurado. ' + getConfigError());
    }

    try {
      const parsed = this.parseMutationQuery(sql, params);

      if (parsed.type === 'insert') {
        const { data, error } = await this._client
          .from(parsed.table)
          .insert(parsed.data)
          .select('id')
          .single();

        if (error) {
          throw new Error(`Supabase insert error: ${error.message}`);
        }

        return {
          lastInsertRowid: data?.id || 0,
          changes: 1,
        };
      } else if (parsed.type === 'update') {
        const { data, error } = await this._client
          .from(parsed.table)
          .update(parsed.data)
          .match(parsed.where || {});

        if (error) {
          throw new Error(`Supabase update error: ${error.message}`);
        }

        // Supabase update puede retornar un array o null
        const updateData = data as any;
        const changes = Array.isArray(updateData)
          ? updateData.length
          : updateData !== null && updateData !== undefined
            ? 1
            : 0;

        return {
          lastInsertRowid: 0,
          changes,
        };
      } else if (parsed.type === 'delete') {
        const { error, count } = await this._client
          .from(parsed.table)
          .delete()
          .match(parsed.where || {});

        if (error) {
          throw new Error(`Supabase delete error: ${error.message}`);
        }

        return {
          lastInsertRowid: 0,
          changes: count || 0,
        };
      } else {
        throw new Error(`Tipo de query no soportado: ${parsed.type}`);
      }
    } catch (error: any) {
      console.error('Error en Supabase execute:', error);
      throw error;
    }
  }

  /**
   * Ejecutar múltiples queries en una transacción
   *
   * Supabase no soporta transacciones multi-query directamente desde el cliente.
   * Usaremos RPC (Remote Procedure Call) o ejecutaremos secuencialmente.
   * Por ahora, ejecutamos secuencialmente y revertimos en caso de error.
   */
  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    if (!this._client) {
      throw new Error('Supabase no está configurado. ' + getConfigError());
    }

    const results: any[] = [];
    const executedOperations: Array<{ type: string; table: string; data: any }> = [];

    try {
      // Ejecutar todas las queries secuencialmente
      for (const query of queries) {
        const parsed = this.parseMutationQuery(query.sql, query.params);

        if (parsed.type === 'insert') {
          const { data, error } = await this._client
            .from(parsed.table)
            .insert(parsed.data)
            .select();

          if (error) throw error;

          executedOperations.push({ type: 'insert', table: parsed.table, data: parsed.data });
          results.push(data);
        } else if (parsed.type === 'update') {
          const { data, error } = await this._client
            .from(parsed.table)
            .update(parsed.data)
            .match(parsed.where || {});

          if (error) throw error;

          executedOperations.push({ type: 'update', table: parsed.table, data: parsed.data });
          results.push(data);
        } else if (parsed.type === 'delete') {
          const { error } = await this._client
            .from(parsed.table)
            .delete()
            .match(parsed.where || {});

          if (error) throw error;

          executedOperations.push({ type: 'delete', table: parsed.table, data: parsed.where });
          results.push(null);
        }
      }

      return results;
    } catch (error: any) {
      // En caso de error, intentar revertir (rollback manual)
      console.error('Error en transacción Supabase, intentando rollback:', error);
      // TODO: Implementar rollback si es necesario
      // Por ahora, solo lanzamos el error
      throw error;
    }
  }

  /**
   * Parsear query SELECT básica
   * Soporta: SELECT columns FROM table [WHERE conditions] [ORDER BY column] [LIMIT n]
   * Soporta: SELECT COUNT(*) FROM table
   * Soporta: SELECT con LEFT JOIN básico (solo para columnas específicas)
   */
  private parseSelectQuery(
    sql: string,
    params?: any[]
  ): {
    table: string;
    columns?: string;
    where?: Record<string, any>;
    orderBy?: { column: string; ascending: boolean };
    limit?: number;
    isCount?: boolean;
    hasJoin?: boolean;
    joinTable?: string;
    joinCondition?: string;
    /** True when SELECT had DISTINCT and we stripped it (deduplicate in JS). */
    hadDistinct?: boolean;
  } {
    const normalized = sql.trim().replace(/\s+/g, ' ');

    // Detectar JOINs
    const hasJoin = /\b(LEFT|RIGHT|INNER|FULL)\s+JOIN\b/i.test(normalized);

    const selectMatch = normalized.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);

    if (!selectMatch) {
      throw new Error(`Query SELECT no válida: ${sql}`);
    }

    let columns = selectMatch[1].trim();
    let hadDistinct = false;
    // Supabase .select() no acepta la palabra DISTINCT; quitar y deduplicar en JS después
    if (/^DISTINCT\s+/i.test(columns)) {
      columns = columns.replace(/^DISTINCT\s+/i, '').trim();
      hadDistinct = true;
    }
    const table = selectMatch[2].trim();

    // Detectar si es COUNT(*)
    const isCount = /COUNT\s*\(\s*\*\s*\)/i.test(columns);

    // Parsear JOIN si existe
    let joinTable: string | undefined;
    let joinCondition: string | undefined;
    if (hasJoin) {
      // Mejorar el regex para capturar correctamente la tabla y condición del JOIN
      // Formato: LEFT JOIN circuits c ON t.circuit_id = c.id
      // O: LEFT JOIN circuits ON tournaments.circuit_id = circuits.id
      // El regex captura: (tipo JOIN) (nombre tabla) (alias opcional) ON (condición)
      // Grupos: 1=tipo, 2=tabla, 3=alias (opcional), 4=condición
      const joinMatch = normalized.match(
        /\b(LEFT|RIGHT|INNER|FULL)\s+JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+(.+?)(?:\s+WHERE|\s+ORDER|\s+LIMIT|$)/i
      );
      if (joinMatch) {
        joinTable = joinMatch[2]; // Nombre de la tabla (ej: circuits) - índice 2
        joinCondition = joinMatch[4]?.trim(); // Condición del JOIN - índice 4 (porque grupo 3 es el alias opcional)
      } else {
        console.warn('JOIN detectado pero regex no capturó:', normalized);
      }
    }

    // Parsear WHERE
    let where: Record<string, any> | undefined;
    const whereMatch = normalized.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      where = this.parseWhereClause(whereMatch[1], params);
    }

    // Parsear ORDER BY (puede tener múltiples columnas)
    let orderBy: { column: string; ascending: boolean } | undefined;
    const orderMatch = normalized.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    if (orderMatch) {
      // Tomar solo la primera columna de ORDER BY por ahora
      // Formato: t.date DESC, t.created_at DESC
      const firstOrder = orderMatch[1].split(',')[0].trim();
      const orderParts = firstOrder.match(/(\w+\.)?(\w+)(?:\s+(ASC|DESC))?/i);
      if (orderParts) {
        const column = orderParts[2]; // Sin el prefijo de tabla
        const direction = orderParts[3];
        orderBy = {
          column,
          ascending: !direction || direction.toUpperCase() === 'ASC',
        };
      }
    }

    // Parsear LIMIT
    let limit: number | undefined;
    const limitMatch = normalized.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
    }

    return {
      table,
      columns: columns === '*' ? undefined : isCount ? undefined : columns,
      where,
      orderBy,
      limit,
      isCount,
      hasJoin,
      joinTable,
      joinCondition,
      hadDistinct,
    };
  }

  /**
   * Deduplicate rows when SELECT had DISTINCT (Supabase doesn't support it).
   * Uses a stable key (sorted object keys) so row identity is consistent.
   */
  private deduplicateRows<T = any>(rows: T[]): T[] {
    if (rows.length <= 1) return rows;
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = this.rowToStableKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private rowToStableKey(row: any): string {
    if (row === null || typeof row !== 'object') return JSON.stringify(row);
    const keys = Object.keys(row).sort();
    const obj: Record<string, unknown> = {};
    for (const k of keys) obj[k] = row[k];
    return JSON.stringify(obj);
  }

  /**
   * Parsear query INSERT, UPDATE o DELETE
   */
  private parseMutationQuery(
    sql: string,
    params?: any[]
  ): {
    type: 'insert' | 'update' | 'delete';
    table: string;
    data?: Record<string, any>;
    where?: Record<string, any>;
  } {
    const normalized = sql.trim().replace(/\s+/g, ' ');

    // INSERT
    const insertMatch = normalized.match(/INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const columns = insertMatch[2].split(',').map((c) => c.trim());
      const values = insertMatch[3].split(',').map((v) => v.trim());

      const data: Record<string, any> = {};
      columns.forEach((col, idx) => {
        let value = values[idx];
        // Reemplazar ? con parámetros
        if (value === '?' && params && params[idx] !== undefined) {
          value = params[idx];
        } else if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        data[col] = value;
      });

      return { type: 'insert', table, data };
    }

    // UPDATE
    const updateMatch = normalized.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|\s*$)/i);
    if (updateMatch) {
      const table = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = normalized.match(/WHERE\s+(.+?)$/i)?.[1];

      const data: Record<string, any> = {};
      const setPairs = setClause.split(',').map((p) => p.trim());
      let setParamIndex = 0;
      setPairs.forEach((pair) => {
        const [key, value] = pair.split('=').map((s) => s.trim());
        let parsedValue: any = value;
        if (value === '?' && params && params[setParamIndex] !== undefined) {
          parsedValue = params[setParamIndex++];
        } else if (value.toUpperCase() === 'CURRENT_TIMESTAMP') {
          parsedValue = new Date().toISOString();
        } else if (value.startsWith('"') && value.endsWith('"')) {
          parsedValue = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          parsedValue = value.slice(1, -1);
        }
        data[key] = parsedValue;
      });

      const whereParams =
        params && setParamIndex < params.length ? params.slice(setParamIndex) : undefined;
      const where = whereClause ? this.parseWhereClause(whereClause, whereParams) : undefined;

      return { type: 'update', table, data, where };
    }

    // DELETE
    const deleteMatch = normalized.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE|\s*$)/i);
    if (deleteMatch) {
      const table = deleteMatch[1];
      const whereClause = normalized.match(/WHERE\s+(.+?)$/i)?.[1];
      const where = whereClause ? this.parseWhereClause(whereClause, params) : undefined;

      return { type: 'delete', table, where };
    }

    throw new Error(`Query no soportada: ${sql}`);
  }

  /**
   * Parsear cláusula WHERE básica
   * Soporta: column = value, column = ?, column IN (...)
   */
  private parseWhereClause(whereClause: string, params?: any[]): Record<string, any> {
    const where: Record<string, any> = {};
    let paramIndex = 0;

    // Dividir por AND
    const conditions = whereClause.split(/\s+AND\s+/i).map((c) => c.trim());

    conditions.forEach((condition) => {
      // column = value o column = ?
      const eqMatch = condition.match(/(\w+)\s*=\s*(.+)/i);
      if (eqMatch) {
        const column = eqMatch[1];
        let value: any = eqMatch[2].trim();

        if (value === '?') {
          value = params && params[paramIndex] !== undefined ? params[paramIndex] : null;
          paramIndex++;
        } else if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        }

        where[column] = value;
      }
    });

    return where;
  }
}
