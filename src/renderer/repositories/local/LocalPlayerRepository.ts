/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseRepository } from '../base/BaseRepository';
import { SqliteClient } from '@api/clients/SqliteClient';
import { Player } from '../../types/player';

/**
 * Repositorio local para operaciones con jugadores usando SQLite
 */
export class LocalPlayerRepository extends BaseRepository<Player> {
  protected tableName = 'players';
  protected apiClient = new SqliteClient();

  /**
   * Buscar jugadores por nombre o username
   * @param searchTerm - Término de búsqueda
   * @returns Array de jugadores que coinciden
   */
  async search(searchTerm: string): Promise<Player[]> {
    const term = `%${searchTerm}%`;
    return this.apiClient.query<Player>(
      'SELECT * FROM players WHERE name LIKE ? OR bga_username LIKE ? ORDER BY name',
      [term, term]
    );
  }

  /**
   * Obtener todos los jugadores de un torneo específico
   * @param tournamentId - ID del torneo
   * @returns Array de jugadores inscritos en el torneo
   */
  async getTournamentPlayers(tournamentId: number): Promise<Player[]> {
    return this.apiClient.query<Player>(
      `SELECT p.* FROM players p
       INNER JOIN tournament_players tp ON p.id = tp.player_id
       WHERE tp.tournament_id = ?
       ORDER BY p.name`,
      [tournamentId]
    );
  }

  /**
   * Sobrescribir findAll para ordenar por nombre por defecto
   */
  async findAll(filters?: any): Promise<Player[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filters) {
      const conditions = this.buildWhereClause(filters, params);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ` ORDER BY name`;

    return this.apiClient.query<Player>(sql, params);
  }
}
