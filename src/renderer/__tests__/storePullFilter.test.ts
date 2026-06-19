import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSkipPullLogInStoreMode } from '../services/storePullFilter';

vi.mock('../utils/storeMode', () => ({
  isStoreMode: vi.fn(() => true),
}));

vi.mock('../services/storeActivation', () => ({
  getAssignedTournamentUuid: vi.fn(() => 'assigned-tournament-uuid'),
}));

const mockQuery = vi.fn();
const mockFrom = vi.fn();
const sqlite = { query: mockQuery } as never;
const supabase = { client: { from: mockFrom } } as never;
const rowCache = new Map();

describe('shouldSkipPullLogInStoreMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowCache.clear();
    mockQuery.mockResolvedValue([]);
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    });
  });

  it('skips match_results when tournament cannot be resolved (store mode)', async () => {
    const skip = await shouldSkipPullLogInStoreMode(
      sqlite,
      supabase,
      'match_results',
      { uuid: 'mr-1', match_uuid: 'm-unknown' },
      rowCache
    );
    expect(skip).toBe(true);
  });

  it('skips foreign tournament rows when tournament_uuid differs', async () => {
    const skip = await shouldSkipPullLogInStoreMode(
      sqlite,
      supabase,
      'rounds',
      { uuid: 'r-1', tournament_uuid: 'other-tournament' },
      rowCache
    );
    expect(skip).toBe(true);
  });

  it('never skips players (global catalog for all stores)', async () => {
    const skip = await shouldSkipPullLogInStoreMode(
      sqlite,
      supabase,
      'players',
      { uuid: 'p-1', name: 'Ana' },
      rowCache
    );
    expect(skip).toBe(false);
  });

  it('syncs players even before activation code is redeemed', async () => {
    const { getAssignedTournamentUuid } = await import('../services/storeActivation');
    vi.mocked(getAssignedTournamentUuid).mockReturnValueOnce(null);

    const skip = await shouldSkipPullLogInStoreMode(
      sqlite,
      supabase,
      'players',
      { uuid: 'p-2', name: 'Bob' },
      rowCache
    );
    expect(skip).toBe(false);
  });
});
