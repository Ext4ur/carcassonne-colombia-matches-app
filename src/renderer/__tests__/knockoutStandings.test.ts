import { describe, it, expect } from 'vitest';
import { computeKnockoutFinalStandings } from '../services/knockoutStandings';
import type { Match, MatchResult, PlayerStanding, Round } from '../types/tournament';

function standing(id: number, rank: number): PlayerStanding {
  return {
    player_id: id,
    player_name: `P${id}`,
    active: true,
    matches_played: rank,
    wins: 0,
    total_points: 20 - rank,
    tiebreak_values: {},
    dropout_round: null,
  };
}

function completedMatch(
  id: number,
  roundId: number,
  winnerId: number,
  extras: Partial<Match> = {}
): Match {
  return {
    id,
    round_id: roundId,
    match_number: 1,
    status: 'completed',
    series_winner_id: winnerId,
    is_knockout: true,
    ...extras,
  };
}

function mkInput(opts: {
  snapshot: PlayerStanding[];
  knockoutSize?: number;
  playBronze?: boolean;
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  resultsByMatch: Record<number, MatchResult[]>;
  playersByMatch: Record<number, number[]>;
}) {
  return {
    snapshot: opts.snapshot,
    knockoutSize: opts.knockoutSize ?? 8,
    playBronzeMatch: opts.playBronze ?? false,
    koRounds: opts.rounds,
    matchesByRound: opts.matchesByRound,
    resultsByMatch: opts.resultsByMatch,
    playersByMatch: opts.playersByMatch,
  };
}

describe('computeKnockoutFinalStandings', () => {
  it('campeón y subcampeón ocupan 1º y 2º', () => {
    const snapshot = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => standing(id, id));
    const finalRound: Round = {
      tournament_id: 1,
      round_number: 5,
      status: 'completed',
      phase: 'knockout',
      knockout_stage: 'final',
      id: 50,
    };
    const finalMatch = completedMatch(500, 50, 3, { knockout_match_stage: 'final' });
    const standings = computeKnockoutFinalStandings(
      mkInput({
        snapshot,
        rounds: [finalRound],
        matchesByRound: new Map([[50, [finalMatch]]]),
        resultsByMatch: {
          500: [
            { match_id: 500, player_id: 3, position: 1, points: 50, tournament_points: 1 },
            { match_id: 500, player_id: 7, position: 2, points: 40, tournament_points: 0 },
          ],
        },
        playersByMatch: { 500: [3, 7] },
      })
    );
    expect(standings[0]?.player_id).toBe(3);
    expect(standings[1]?.player_id).toBe(7);
  });

  it('sin bronce: perdedores de semifinal 3º–4º por suizo congelado', () => {
    const snapshot = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => standing(id, id));
    const sfRound: Round = {
      tournament_id: 1,
      round_number: 4,
      status: 'completed',
      phase: 'knockout',
      knockout_stage: 'semifinal',
      id: 40,
    };
    const m1 = completedMatch(401, 40, 1, { match_number: 1, knockout_bracket_slot: 1 });
    const m2 = completedMatch(402, 40, 4, { match_number: 2, knockout_bracket_slot: 2 });
    const standings = computeKnockoutFinalStandings(
      mkInput({
        snapshot,
        playBronze: false,
        rounds: [sfRound],
        matchesByRound: new Map([[40, [m1, m2]]]),
        resultsByMatch: {
          401: [
            { match_id: 401, player_id: 1, position: 1, points: 50, tournament_points: 1 },
            { match_id: 401, player_id: 2, position: 2, points: 40, tournament_points: 0 },
          ],
          402: [
            { match_id: 402, player_id: 4, position: 1, points: 50, tournament_points: 1 },
            { match_id: 402, player_id: 3, position: 2, points: 40, tournament_points: 0 },
          ],
        },
        playersByMatch: { 401: [1, 2], 402: [4, 3] },
      })
    );
    const ids = standings.map((s) => s.player_id);
    expect(ids[0]).toBe(1);
    expect(ids[1]).toBe(4);
    expect(ids[2]).toBe(2);
    expect(ids[3]).toBe(3);
    expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(5));
    expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(5));
  });

  it('con bronce: ganador 3º y perdedor 4º', () => {
    const snapshot = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => standing(id, id));
    const finalRound: Round = {
      tournament_id: 1,
      round_number: 5,
      status: 'completed',
      phase: 'knockout',
      knockout_stage: 'final',
      id: 50,
    };
    const finalMatch = completedMatch(501, 50, 1, {
      match_number: 1,
      knockout_match_stage: 'final',
    });
    const bronzeMatch = completedMatch(502, 50, 2, {
      match_number: 2,
      knockout_match_stage: 'third_place',
    });
    const standings = computeKnockoutFinalStandings(
      mkInput({
        snapshot,
        playBronze: true,
        rounds: [finalRound],
        matchesByRound: new Map([[50, [finalMatch, bronzeMatch]]]),
        resultsByMatch: {
          501: [
            { match_id: 501, player_id: 1, position: 1, points: 50, tournament_points: 1 },
            { match_id: 501, player_id: 4, position: 2, points: 40, tournament_points: 0 },
          ],
          502: [
            { match_id: 502, player_id: 2, position: 1, points: 50, tournament_points: 1 },
            { match_id: 502, player_id: 3, position: 2, points: 40, tournament_points: 0 },
          ],
        },
        playersByMatch: { 501: [1, 4], 502: [2, 3] },
      })
    );
    expect(standings[0]?.player_id).toBe(1);
    expect(standings[1]?.player_id).toBe(4);
    expect(standings[2]?.player_id).toBe(2);
    expect(standings[3]?.player_id).toBe(3);
  });

  it('perdedores de cuartos ordenados por suizo (5º–8º)', () => {
    const snapshot = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => standing(id, id));
    const qfRound: Round = {
      tournament_id: 1,
      round_number: 3,
      status: 'completed',
      phase: 'knockout',
      knockout_stage: 'quarterfinal',
      id: 30,
    };
    const m301 = completedMatch(301, 30, 1, { match_number: 1 });
    const m302 = completedMatch(302, 30, 4, { match_number: 2 });
    const m303 = completedMatch(303, 30, 3, { match_number: 3 });
    const m304 = completedMatch(304, 30, 2, { match_number: 4 });
    const matches = [m301, m302, m303, m304];
    const standings = computeKnockoutFinalStandings(
      mkInput({
        snapshot,
        rounds: [qfRound],
        matchesByRound: new Map([[30, matches]]),
        resultsByMatch: {
          301: [
            { match_id: 301, player_id: 1, position: 1, points: 50, tournament_points: 1 },
            { match_id: 301, player_id: 8, position: 2, points: 40, tournament_points: 0 },
          ],
          302: [
            { match_id: 302, player_id: 4, position: 1, points: 50, tournament_points: 1 },
            { match_id: 302, player_id: 5, position: 2, points: 40, tournament_points: 0 },
          ],
          303: [
            { match_id: 303, player_id: 3, position: 1, points: 50, tournament_points: 1 },
            { match_id: 303, player_id: 6, position: 2, points: 40, tournament_points: 0 },
          ],
          304: [
            { match_id: 304, player_id: 2, position: 1, points: 50, tournament_points: 1 },
            { match_id: 304, player_id: 7, position: 2, points: 40, tournament_points: 0 },
          ],
        },
        playersByMatch: {
          301: [1, 8],
          302: [4, 5],
          303: [3, 6],
          304: [2, 7],
        },
      })
    );
    expect(standings.slice(0, 4).map((s) => s.player_id)).toEqual([1, 2, 3, 4]);
    expect(standings.slice(4, 8).map((s) => s.player_id)).toEqual([5, 6, 7, 8]);
  });
});

describe('resolveKnockoutGameStarter', () => {
  it('higher_swiss_seed elige mejor semilla en juego 1', async () => {
    const { resolveKnockoutGameStarter } = await import('../services/knockout');
    const starter = resolveKnockoutGameStarter(1, [10, 20], {
      matchStarter: 'higher_swiss_seed',
      seriesStarterMode: 'alternate',
      seedByPlayer: new Map([
        [10, 2],
        [20, 5],
      ]),
      seriesState: {
        targetWins: 2,
        games: [],
        winsByPlayer: { 10: 0, 20: 0 },
        isComplete: false,
        winnerId: null,
        nextGameNumber: 1,
      },
      existingStarters: {},
    });
    expect(starter).toBe(10);
  });
});
