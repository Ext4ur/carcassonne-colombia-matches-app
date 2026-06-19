import { describe, it, expect } from 'vitest';
import { filterRecordForLocalSQLite } from '../services/syncLocalSchema';

describe('filterRecordForLocalSQLite', () => {
  it('elimina series_winner_uuid al persistir matches en SQLite', () => {
    const filtered = filterRecordForLocalSQLite('matches', {
      uuid: 'm-1',
      status: 'completed',
      series_winner_id: 5,
      series_winner_uuid: 'player-uuid-remote-only',
      round_uuid: 'r-1',
    });
    expect(filtered.series_winner_uuid).toBeUndefined();
    expect(filtered.series_winner_id).toBe(5);
    expect(filtered.round_uuid).toBe('r-1');
  });

  it('conserva columnas de tournament_knockout_seeds sin uuid de sync remoto', () => {
    const filtered = filterRecordForLocalSQLite('tournament_knockout_seeds', {
      uuid: 's-1',
      tournament_id: 1,
      player_id: 2,
      seed: 3,
      tournament_uuid: 't-uuid',
      player_uuid: 'p-uuid',
    });
    expect(filtered).toEqual({
      uuid: 's-1',
      tournament_id: 1,
      player_id: 2,
      seed: 3,
    });
  });
});
