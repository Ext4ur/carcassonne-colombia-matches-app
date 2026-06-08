import { describe, it, expect } from 'vitest';
import type { Player } from '../types/player';
import { parseBackupJson } from '../services/import';
import {
  collectPlayerIdsFromTournamentSnapshots,
  collectPlayersOnlyFromSnapshots,
  traverseTournamentPlayerRefs,
} from '../utils/exportImportHelpers';

describe('collectPlayerIdsFromTournamentSnapshots', () => {
  it('colecciona jugadores desde inscripción, primera mesa y resultados', () => {
    const tournaments = [
      {
        players: [{ id: 10 }, { id: 11 }],
        rounds: [
          {
            matches: [
              {
                first_player_id: 10,
                players: [{ id: 11 }, { id: 12 }],
                results: [{ player_id: 10 }, { player_id: 12 }],
              },
            ],
          },
        ],
      },
    ];
    const ids = collectPlayerIdsFromTournamentSnapshots(tournaments);
    expect([...ids].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it('devuelve vacío cuando no hay torneos', () => {
    expect(collectPlayerIdsFromTournamentSnapshots([]).size).toBe(0);
  });
});

describe('traverseTournamentPlayerRefs', () => {
  it('invoca cb por primera mesa sin fila inline', () => {
    const seen: number[] = [];
    traverseTournamentPlayerRefs({ rounds: [{ matches: [{ first_player_id: 7 }] }] }, (id) =>
      seen.push(id)
    );
    expect(seen).toEqual([7]);
  });
});

describe('collectPlayersOnlyFromSnapshots', () => {
  it('prioriza filas ya en map previo sobre stubs del árbol', () => {
    const prior = new Map<number, Player>([[1, { id: 1, name: 'Global', email: 'a@x' }]]);
    const map = collectPlayersOnlyFromSnapshots(
      [
        {
          rounds: [
            {
              matches: [{ results: [{ player_id: 1 }, { player_id: 99 }] }],
            },
          ],
        },
      ],
      prior
    );
    expect(map.get(1)?.name).toBe('Global');
    expect(map.get(99)?.name).toBe('Player 99');
  });
});

describe('parseBackupJson v1.2', () => {
  it('acepta cities y places opcionales', () => {
    const parsed = parseBackupJson(
      JSON.stringify({
        version: '1.2',
        exportDate: '2026-01-01',
        data: {
          players: [],
          tournaments: [],
          circuits: [],
          cities: [{ id: 1, name: 'Bogotá' }],
          places: [{ id: 10, name: 'Café Meeple', city_id: 1, city_name: 'Bogotá' }],
        },
      })
    );
    expect(parsed.data.cities).toHaveLength(1);
    expect(parsed.data.places?.[0]?.city_name).toBe('Bogotá');
  });
});
