import { describe, it, expect } from 'vitest';
import {
  standardBracketFirstRoundPairs,
  standardBracketSeedOrder,
  knockoutStageForPlayerCount,
  seriesTargetWins,
  resolveEffectiveKnockoutSize,
} from '../types/knockout';
import {
  buildFirstKnockoutPairings,
  computeSeriesState,
  canStartKnockoutPhase,
  countSwissRounds,
  resolveGameStarter,
  resolveKnockoutGameStarter,
  isSeriesMatch,
  resultsForDisplay,
  groupResultsByGame,
} from '../services/knockout';
import { buildBracketTree } from '../utils/knockoutBracketTree';
import type { BracketRoundColumn } from '../components/tournament/KnockoutBracket';
import type { KnockoutMatchStage } from '../types/knockout';
import type { PlayerStanding } from '../types/tournament';
import type { Match, MatchResult } from '../types/tournament';

function standing(id: number, rank: number): PlayerStanding {
  return {
    player_id: id,
    player_name: `P${id}`,
    active: true,
    matches_played: rank,
    wins: 0,
    total_points: 10 - rank,
    tiebreak_values: {},
    dropout_round: null,
  };
}

describe('resolveEffectiveKnockoutSize', () => {
  it('reduces Top 8 to 4 when only 6 active players', () => {
    expect(resolveEffectiveKnockoutSize(8, 6)).toBe(4);
  });

  it('keeps Top 8 when enough players', () => {
    expect(resolveEffectiveKnockoutSize(8, 10)).toBe(8);
  });

  it('returns null when fewer than 2 active players', () => {
    expect(resolveEffectiveKnockoutSize(8, 1)).toBeNull();
  });
});

describe('knockout bracket seeding', () => {
  it('standard seed order for 8', () => {
    expect(standardBracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('first round pairs 1v8, 4v5, 2v7, 3v6 (semis cruzan ramas)', () => {
    expect(standardBracketFirstRoundPairs(8)).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it('buildFirstKnockoutPairings uses top N by standings', () => {
    const standings = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => standing(id, id));
    const { pairings, stage, seeds } = buildFirstKnockoutPairings(standings, 8, 'best_of_1');
    expect(stage).toBe('quarterfinal');
    expect(seeds).toHaveLength(8);
    expect(pairings).toHaveLength(4);
    expect(pairings[0]).toMatchObject({ player1Id: 1, player2Id: 8, bracketSlot: 1 });
    expect(pairings[3]).toMatchObject({ player1Id: 3, player2Id: 6, bracketSlot: 4 });
  });
});

describe('knockout series', () => {
  it('best_of_3 completes at 2 wins', () => {
    const match: Match = {
      round_id: 1,
      match_number: 1,
      status: 'pending',
      series_target_wins: 2,
    };
    const results: MatchResult[] = [
      { match_id: 1, player_id: 10, position: 1, points: 50, tournament_points: 1, game_number: 1 },
      { match_id: 1, player_id: 20, position: 2, points: 40, tournament_points: 0, game_number: 1 },
      { match_id: 1, player_id: 10, position: 1, points: 55, tournament_points: 1, game_number: 2 },
      { match_id: 1, player_id: 20, position: 2, points: 30, tournament_points: 0, game_number: 2 },
    ];
    const state = computeSeriesState(match, results, [10, 20]);
    expect(state.isComplete).toBe(true);
    expect(state.winnerId).toBe(10);
    expect(state.winsByPlayer[10]).toBe(2);
  });

  it('seriesTargetWins', () => {
    expect(seriesTargetWins('best_of_1')).toBe(1);
    expect(seriesTargetWins('best_of_3')).toBe(2);
  });
});

describe('knockout phase gates', () => {
  it('canStartKnockoutPhase when swiss done', () => {
    const rounds = [
      { tournament_id: 1, round_number: 1, status: 'completed' as const, phase: 'swiss' as const },
      { tournament_id: 1, round_number: 2, status: 'completed' as const, phase: 'swiss' as const },
    ];
    expect(
      canStartKnockoutPhase(
        { competition_format: 'swiss_knockout', number_of_rounds: 2 },
        rounds,
        8,
        8
      ).ok
    ).toBe(true);
    expect(countSwissRounds(rounds)).toBe(2);
  });

  it('allows knockout with Top 8 config when only 6 active players (effective 4)', () => {
    const rounds = [
      { tournament_id: 1, round_number: 1, status: 'completed' as const, phase: 'swiss' as const },
      { tournament_id: 1, round_number: 2, status: 'completed' as const, phase: 'swiss' as const },
    ];
    const result = canStartKnockoutPhase(
      { competition_format: 'swiss_knockout', number_of_rounds: 2 },
      rounds,
      6,
      8
    );
    expect(result.ok).toBe(true);
    expect(result.effectiveSize).toBe(4);
  });

  it('knockoutStageForPlayerCount', () => {
    expect(knockoutStageForPlayerCount(8)).toBe('quarterfinal');
    expect(knockoutStageForPlayerCount(4)).toBe('semifinal');
    expect(knockoutStageForPlayerCount(2)).toBe('final');
  });
});

describe('resolveGameStarter', () => {
  it('prefers series_meta over first_player_id', () => {
    const match: Match = {
      round_id: 1,
      match_number: 1,
      status: 'completed',
      first_player_id: 20,
      series_meta: JSON.stringify({ gameStarters: { 1: 10 } }),
    };
    expect(resolveGameStarter(match, 1)).toBe(10);
  });

  it('falls back to first_player_id for game 1', () => {
    const match: Match = {
      round_id: 1,
      match_number: 1,
      status: 'completed',
      first_player_id: 15,
    };
    expect(resolveGameStarter(match, 1)).toBe(15);
  });
});

describe('series display helpers', () => {
  it('isSeriesMatch when series_target_wins > 1', () => {
    expect(
      isSeriesMatch({ round_id: 1, match_number: 1, status: 'pending', series_target_wins: 2 })
    ).toBe(true);
    expect(
      isSeriesMatch({ round_id: 1, match_number: 1, status: 'pending', series_target_wins: 1 })
    ).toBe(false);
  });

  it('groupResultsByGame and resultsForDisplay', () => {
    const match: Match = {
      round_id: 1,
      match_number: 1,
      status: 'completed',
      series_target_wins: 2,
    };
    const results: MatchResult[] = [
      { match_id: 1, player_id: 10, position: 1, points: 50, tournament_points: 0, game_number: 1 },
      { match_id: 1, player_id: 20, position: 2, points: 40, tournament_points: 0, game_number: 1 },
      { match_id: 1, player_id: 10, position: 1, points: 55, tournament_points: 0, game_number: 2 },
      { match_id: 1, player_id: 20, position: 2, points: 30, tournament_points: 0, game_number: 2 },
    ];
    expect(groupResultsByGame(results).size).toBe(2);
    expect(resultsForDisplay(match, results)).toHaveLength(2);
    expect(resultsForDisplay({ ...match, series_target_wins: 1 }, results)).toHaveLength(2);
  });
});

describe('resolveKnockoutGameStarter modes', () => {
  const baseState = {
    targetWins: 2,
    games: [
      {
        gameNumber: 1,
        player1Points: 50,
        player2Points: 40,
        starterId: 10,
        winnerId: 10,
      },
    ],
    winsByPlayer: { 10: 1, 20: 0 },
    isComplete: false,
    winnerId: null,
    nextGameNumber: 2,
  };

  it('previous_loser starts game 2', () => {
    const starter = resolveKnockoutGameStarter(2, [10, 20], {
      matchStarter: 'higher_swiss_seed',
      seriesStarterMode: 'previous_loser',
      seedByPlayer: new Map(),
      seriesState: baseState,
      existingStarters: { 1: 10 },
    });
    expect(starter).toBe(20);
  });

  it('alternate switches from game 1 starter', () => {
    const starter = resolveKnockoutGameStarter(2, [10, 20], {
      matchStarter: 'higher_swiss_seed',
      seriesStarterMode: 'alternate',
      seedByPlayer: new Map(),
      seriesState: baseState,
      existingStarters: { 1: 10 },
    });
    expect(starter).toBe(20);
  });
});

describe('buildBracketTree', () => {
  it('splits QF into left and right with final in center', () => {
    const mkNode = (slot: number, stage?: KnockoutMatchStage) => ({
      match: {
        round_id: 1,
        match_number: slot,
        status: 'completed' as const,
        knockout_bracket_slot: slot,
        knockout_match_stage: stage ?? null,
      },
      player1Name: `A${slot}`,
      player2Name: `B${slot}`,
    });
    const columns: BracketRoundColumn[] = [
      {
        round: {
          tournament_id: 1,
          round_number: 3,
          status: 'completed',
          phase: 'knockout',
          knockout_stage: 'quarterfinal',
        },
        matches: [1, 2, 3, 4].map((s) => mkNode(s)),
      },
      {
        round: {
          tournament_id: 1,
          round_number: 5,
          status: 'completed',
          phase: 'knockout',
          knockout_stage: 'final',
        },
        matches: [mkNode(1, 'final')],
      },
    ];
    const tree = buildBracketTree(columns);
    expect(tree.final).not.toBeNull();
    expect(tree.leftRounds[0]?.matches).toHaveLength(2);
    expect(tree.rightRounds[0]?.matches).toHaveLength(2);
  });
});
