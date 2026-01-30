/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from '../services/database';
import { IApiClient } from '../api/clients/IApiClient';

// Import the module to access it later (it will be the mock)
import * as clientFactory from '@api/clients/clientFactory';

// Mock getApiClient using the alias implementation
vi.mock('@api/clients/clientFactory', () => {
  let clientInstance: IApiClient | null = null;
  return {
    getApiClient: () => clientInstance,
    setMockClient: (client: IApiClient) => {
      clientInstance = client;
    },
    createApiClient: () => clientInstance,
    isSupabaseConfigured: () => false,
  };
});

// Mock dbCache to disable caching
vi.mock('../services/dbCache', () => ({
  get: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  invalidateTournament: vi.fn(),
  LIST_KEYS: {
    players: 'players',
    tournaments: 'tournaments', // Fixed typo
    cities: 'cities',
    places: 'places',
    circuits: 'circuits',
  },
}));

class MockSqliteClient implements IApiClient {
  public queries: Array<{ sql: string; params?: any[] }> = [];

  // Mock data to return from queries
  public mockSelectReturns: any[] = [];

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    this.queries.push({ sql, params });
    // Return last pushed mock data or empty array
    const data = this.mockSelectReturns.shift();
    return (data || []) as T[];
  }

  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    this.queries.push({ sql, params });
    return {
      lastInsertRowid: 123, // Dummy ID
      changes: 1,
    };
  }

  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    this.queries.push(...queries);
    return queries.map(() => ({ lastInsertRowid: 123, changes: 1 }));
  }
}

describe('DatabaseService (Mocked)', () => {
  let mockClient: MockSqliteClient;

  beforeEach(() => {
    mockClient = new MockSqliteClient();
    (clientFactory as any).setMockClient(mockClient);
  });

  describe('Players CRUD', () => {
    it('createPlayer sends correct SQL', async () => {
      await DatabaseService.createPlayer({
        name: 'Test Player',
        bga_username: 'bga_user',
        email: 'test@example.com',
      });

      expect(mockClient.queries.length).toBe(1);
      const q = mockClient.queries[0];
      expect(q.sql).toContain('INSERT INTO players');
      expect(q.params).toEqual(['Test Player', 'bga_user', 'name', null, 'test@example.com', null]);
    });

    it('updatePlayer sends correct SQL', async () => {
      await DatabaseService.updatePlayer(10, { name: 'Updated Name' });

      expect(mockClient.queries.length).toBe(1);
      const q = mockClient.queries[0];
      expect(q.sql).toContain('UPDATE players SET');
      expect(q.sql).toContain('name = ?');
      expect(q.params).toContain('Updated Name');
      expect(q.params).toContain(10); // ID at end
    });

    it('searchPlayers sends correct SQL', async () => {
      mockClient.mockSelectReturns.push([{ id: 1, name: 'Found' }]);
      const res = await DatabaseService.searchPlayers('Sea');

      expect(res).toHaveLength(1);
      const q = mockClient.queries[0];
      expect(q.sql).toContain('LIKE ?');
      expect(q.params).toEqual(['%Sea%', '%Sea%']);
    });
  });

  describe('Cities CRUD', () => {
    it('createCity sends correct SQL', async () => {
      await DatabaseService.createCity({ name: 'Bogotá' });
      const q = mockClient.queries[0];
      expect(q.sql).toContain('INSERT INTO cities');
      expect(q.params).toEqual(['Bogotá']);
    });

    it('updateCity sends correct SQL', async () => {
      await DatabaseService.updateCity(5, { name: 'Medellín' });
      const q = mockClient.queries[0];
      expect(q.sql).toContain('UPDATE cities');
      expect(q.params).toContain('Medellín');
    });
  });

  describe('Places CRUD', () => {
    it('createPlace sends correct SQL', async () => {
      await DatabaseService.createPlace({ name: 'Lugar X', city_id: 2 });
      const q = mockClient.queries[0];
      expect(q.sql).toContain('INSERT INTO places');
      expect(q.params).toEqual(['Lugar X', 2]);
    });
  });
});
