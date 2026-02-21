/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

// 1. Setup Global Mocks BEFORE importing modules that might use them
const mockUUID = '1234-5678-uuid';
const cryptoMock = {
  randomUUID: () => mockUUID,
};

// Polyfill self/window/navigator for Node environment
if (typeof self === 'undefined') {
  (global as any).self = global;
}
if (typeof window === 'undefined') {
  (global as any).window = global;
}
if (typeof navigator === 'undefined') {
  (global as any).navigator = {
    onLine: true,
    userAgent: 'node',
  };
}

// Ensure crypto exists on self/global
if (!(global.self as any).crypto) {
  Object.defineProperty(global.self, 'crypto', {
    value: cryptoMock,
    writable: true,
  });
} else {
  // If it exists (e.g. Node 19+ has global crypto), ensure randomUUID is mocked
  if (!global.crypto.randomUUID) {
    (global.crypto as any).randomUUID = cryptoMock.randomUUID;
  } else {
    // Spy on it if needed, or just replace
    // Replacing is safer for deterministic UUIDs in tests
    Object.defineProperty(global.self, 'crypto', {
      value: cryptoMock,
      writable: true,
    });
  }
}

// 2. Define Mocks for Dependencies
// Mock SyncService
const mockAddToQueue = vi.fn();
vi.mock('../services/syncService', () => ({
  SyncService: {
    startSync: vi.fn(),
    stopSync: vi.fn(),
    sync: vi.fn(),
    addToQueue: mockAddToQueue,
  },
}));

// Mock dbCache
vi.mock('../services/dbCache', () => ({
  get: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  invalidateTournament: vi.fn(),
  invalidateAllRounds: vi.fn(),
  LIST_KEYS: {
    players: 'players',
    tournaments: 'tournaments', // typos fixed
    cities: 'cities',
    places: 'places',
    circuits: 'circuits',
  },
}));

// Mock SqliteClient
const mockExecute = vi.fn();
const mockQuery = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../api/clients/SqliteClient', () => {
  return {
    SqliteClient: vi.fn().mockImplementation(() => {
      return {
        execute: mockExecute,
        query: mockQuery,
        transaction: mockTransaction,
      };
    }),
  };
});

describe('DatabaseService (Local-First)', () => {
  // Use dynamic import variable
  let DatabaseService: any;

  beforeAll(async () => {
    // Import module under test AFTER mocks are set up
    const dbModule = await import('../services/database');
    DatabaseService = dbModule.DatabaseService;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ lastInsertRowid: 999, changes: 1 });
    mockQuery.mockResolvedValue([]);
  });

  describe('Players CRUD', () => {
    it('createPlayer generates UUID and inserts correctly', async () => {
      await DatabaseService.createPlayer({
        name: 'Test Player',
        bga_username: 'bga_user',
        email: 'test@example.com',
      });

      // 1. Should execute INSERT with UUID
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = mockExecute.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO players');
      expect(call[0]).toContain('uuid');
      // UUID is first param in the new implementation?
      // "INSERT INTO players (uuid, name...)" -> params: [uuid, name...]
      expect(call[1][0]).toBe(mockUUID);
      expect(call[1][1]).toBe('Test Player');

      // 2. Should add to Sync Queue
      expect(mockAddToQueue).toHaveBeenCalledWith(
        'players',
        'INSERT',
        expect.objectContaining({ uuid: mockUUID, name: 'Test Player' })
      );
    });

    it('updatePlayer updates local and syncs', async () => {
      mockQuery.mockResolvedValueOnce([{ uuid: 'existing-uuid' }]);

      await DatabaseService.updatePlayer(10, { name: 'Updated Name' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT uuid FROM players'),
        [10]
      );

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = mockExecute.mock.calls[0];
      expect(call[0]).toContain('UPDATE players SET');
      expect(call[0]).toContain('name = ?');

      expect(mockAddToQueue).toHaveBeenCalledWith(
        'players',
        'UPDATE',
        expect.objectContaining({ uuid: 'existing-uuid', name: 'Updated Name' })
      );
    });

    it('deletePlayer deletes local and syncs', async () => {
      mockQuery.mockResolvedValueOnce([{ uuid: 'existing-uuid' }]);

      await DatabaseService.deletePlayer(5);

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM players'), [5]);

      expect(mockAddToQueue).toHaveBeenCalledWith('players', 'DELETE', { uuid: 'existing-uuid' });
    });
  });

  describe('Tournament CRUD', () => {
    it('createTournament handles UUIDs and FKs', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 1 }]) // getDefaultPlaceId
        .mockResolvedValueOnce([{ uuid: 'place-uuid' }]); // getUuid(places)

      await DatabaseService.createTournament({
        name: 'My Tournament',
        date: '2025-01-01',
        type: 'qualifier',
        players_per_match: 2,
      });

      const call = mockExecute.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO tournaments');
      expect(call[1][0]).toBe(mockUUID);

      expect(mockAddToQueue).toHaveBeenCalledWith(
        'tournaments',
        'INSERT',
        expect.objectContaining({
          uuid: mockUUID,
          place_uuid: 'place-uuid',
        })
      );
    });
  });
});
