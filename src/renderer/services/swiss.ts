import { DatabaseService } from './database';
import { TiebreakService } from './tiebreak';
import {
  Tournament,
  Round,
  Match,
  PlayerStanding,
  MatchResult,
  TiebreakCriterion,
  TournamentConfig,
  BuchholzByeMode,
  normalizeBuchholzByeMode,
} from '../types/tournament';
import { Player } from '../types/player';
import { calculateNumberOfRounds } from '../utils/tournament';
import { getPlayerDisplayName, type PlayerDisplayMode } from '../utils/playerDisplayName';
import i18n from '../i18n/config';

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k > n - k) k = n - k;
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i;
  }
  return Math.round(r);
}

function combinationsOf<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const out: T[][] = [];
  const path: T[] = [];
  function dfs(start: number) {
    if (path.length === k) {
      out.push([...path]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]!);
      dfs(i + 1);
      path.pop();
    }
  }
  dfs(0);
  return out;
}

/** Contexto para comparar dos filas de clasificación (misma lógica que el sort). */
export type StandingsPairCompareContext = {
  criteria: TiebreakCriterion[];
  resultsByMatch: Record<number, MatchResult[]>;
  /**
   * Firmas pre-H2H donde, dentro del grupo empatado, todos tienen el mismo número de victorias
   * directas entre sí (p. ej. ciclo 3: 1-1-1). El H2H por parejas no es transitivo → se pasa al
   * siguiente criterio.
   */
  headToHeadInconclusiveSignatures?: Set<string>;
  /** Victorias directas de cada jugador contra el resto de su grupo pre-H2H (mismo signature). */
  intraGroupHeadToHeadWins?: Map<number, number>;
};

/** Criterios habilitados en el orden configurado (`order`); misma cadena que el desempate en clasificación. */
export function enabledTiebreakCriteriaInOrder(criteria: TiebreakCriterion[]): TiebreakCriterion[] {
  return [...criteria].filter((c) => c.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Victorias en mesas compartidas (mejor posición = victoria en esa mesa). */
export function mutualHeadToHeadWins(
  playerIdA: number,
  playerIdB: number,
  resultsByMatch: Record<number, MatchResult[]>
): { winsA: number; winsB: number } {
  let winsA = 0;
  let winsB = 0;
  Object.values(resultsByMatch).forEach((results) => {
    const resA = results.find((r: MatchResult) => r.player_id === playerIdA);
    const resB = results.find((r: MatchResult) => r.player_id === playerIdB);
    if (resA && resB) {
      if (resA.position < resB.position) winsA++;
      else if (resB.position < resA.position) winsB++;
    }
  });
  return { winsA, winsB };
}

/**
 * Firma de empate en el mismo punto en que el ordenador usa el H2H: activo, victorias y valores de
 * criterios habilitados que van **antes** de `head_to_head` por `order`. No incluye criterios posteriores
 * (p. ej. `point_difference`), porque si el sort llegó a H2H es que ya iban empatados sin esos.
 */
export function preHeadToHeadTieSignature(
  s: PlayerStanding,
  criteria: TiebreakCriterion[]
): string {
  const sorted = enabledTiebreakCriteriaInOrder(criteria);
  const parts: string[] = [s.active ? '1' : '0', String(s.wins)];
  for (const c of sorted) {
    if (c.id === 'wins') continue;
    if (c.id === 'head_to_head') break;
    parts.push(String(s.tiebreak_values[c.id] ?? 0));
  }
  return parts.join('|');
}

/**
 * Agrupa por `preHeadToHeadTieSignature` y detecta empates “reales” en H2H dentro del grupo
 * (mismo récord de victorias directas mutuas), p. ej. rock-paper-scissors entre tres.
 */
export function buildHeadToHeadClusterMeta(
  standings: PlayerStanding[],
  criteria: TiebreakCriterion[],
  resultsByMatch: Record<number, MatchResult[]>
): Pick<
  StandingsPairCompareContext,
  'headToHeadInconclusiveSignatures' | 'intraGroupHeadToHeadWins'
> {
  const intraGroupHeadToHeadWins = new Map<number, number>();
  const headToHeadInconclusiveSignatures = new Set<string>();

  const bySig = new Map<string, PlayerStanding[]>();
  for (const s of standings) {
    const sig = preHeadToHeadTieSignature(s, criteria);
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig)!.push(s);
  }

  for (const [sig, group] of bySig) {
    if (group.length < 2) continue;
    const ids = group.map((g) => g.player_id);
    for (const p of ids) {
      let w = 0;
      for (const q of ids) {
        if (q === p) continue;
        const { winsA, winsB } = mutualHeadToHeadWins(p, q, resultsByMatch);
        if (winsA > winsB) w++;
      }
      intraGroupHeadToHeadWins.set(p, w);
    }
    const counts = ids.map((id) => intraGroupHeadToHeadWins.get(id) ?? 0);
    if (counts.length > 0 && counts.every((c) => c === counts[0])) {
      headToHeadInconclusiveSignatures.add(sig);
    }
  }

  return { headToHeadInconclusiveSignatures, intraGroupHeadToHeadWins };
}

/**
 * Comparador: negativo si `a` va antes que `b` en la clasificación.
 * Tras activo y victorias, aplica criterios habilitados según su `order` (no el orden del array).
 */
export function compareStandingsPair(
  a: PlayerStanding,
  b: PlayerStanding,
  ctx: StandingsPairCompareContext
): number {
  if (a.active !== b.active) {
    return a.active ? -1 : 1;
  }
  if (b.wins !== a.wins) {
    return b.wins - a.wins;
  }
  for (const criterion of enabledTiebreakCriteriaInOrder(ctx.criteria)) {
    if (criterion.id === 'wins') continue;

    if (criterion.id === 'head_to_head') {
      const sigA = preHeadToHeadTieSignature(a, ctx.criteria);
      const sigB = preHeadToHeadTieSignature(b, ctx.criteria);
      if (sigA === sigB && ctx.headToHeadInconclusiveSignatures?.has(sigA)) {
        continue;
      }
      if (sigA === sigB && ctx.intraGroupHeadToHeadWins?.size) {
        const wa = ctx.intraGroupHeadToHeadWins.get(a.player_id) ?? 0;
        const wb = ctx.intraGroupHeadToHeadWins.get(b.player_id) ?? 0;
        if (wa !== wb) {
          return wb - wa;
        }
      }
      const { winsA, winsB } = mutualHeadToHeadWins(a.player_id, b.player_id, ctx.resultsByMatch);
      if (winsA !== winsB) {
        return winsB - winsA;
      }
    } else {
      const valA = a.tiebreak_values[criterion.id] || 0;
      const valB = b.tiebreak_values[criterion.id] || 0;
      if (valA !== valB) {
        return valB - valA;
      }
    }
  }
  return a.player_id - b.player_id;
}

/** Primer criterio (id) en el que difieren `a` vs `b`, o null si empate total en el ordenamiento. */
export function explainFirstDifferingStandingsCriterion(
  a: PlayerStanding,
  b: PlayerStanding,
  ctx: StandingsPairCompareContext
): string | null {
  if (a.active !== b.active) {
    return 'active';
  }
  if (b.wins !== a.wins) {
    return 'wins';
  }
  for (const criterion of enabledTiebreakCriteriaInOrder(ctx.criteria)) {
    if (criterion.id === 'wins') continue;

    if (criterion.id === 'head_to_head') {
      const sigA = preHeadToHeadTieSignature(a, ctx.criteria);
      const sigB = preHeadToHeadTieSignature(b, ctx.criteria);
      if (sigA === sigB && ctx.headToHeadInconclusiveSignatures?.has(sigA)) {
        continue;
      }
      if (sigA === sigB && ctx.intraGroupHeadToHeadWins?.size) {
        const wa = ctx.intraGroupHeadToHeadWins.get(a.player_id) ?? 0;
        const wb = ctx.intraGroupHeadToHeadWins.get(b.player_id) ?? 0;
        if (wa !== wb) {
          return 'head_to_head';
        }
      }
      const { winsA, winsB } = mutualHeadToHeadWins(a.player_id, b.player_id, ctx.resultsByMatch);
      if (winsA !== winsB) {
        return 'head_to_head';
      }
    } else {
      const valA = a.tiebreak_values[criterion.id] || 0;
      const valB = b.tiebreak_values[criterion.id] || 0;
      if (valA !== valB) {
        return criterion.id;
      }
    }
  }
  return null;
}

/**
 * Para cada bloque consecutivo con el mismo empate pre-H2H, anota contra quién ganó / perdió
 * el directo dentro del bloque (p. ej. triple empate cíclico: cada uno con un ganó y un perdió).
 */
export function annotateHeadToHeadGroupDisplay(
  sorted: PlayerStanding[],
  ctx: StandingsPairCompareContext
): void {
  const { criteria, resultsByMatch } = ctx;
  const indexOfPlayer = (playerId: number) => sorted.findIndex((s) => s.player_id === playerId);

  let start = 0;
  while (start < sorted.length) {
    const sig0 = preHeadToHeadTieSignature(sorted[start]!, criteria);
    let end = start + 1;
    while (end < sorted.length && preHeadToHeadTieSignature(sorted[end]!, criteria) === sig0) {
      end++;
    }
    const cluster = sorted.slice(start, end);
    if (cluster.length >= 2) {
      for (const p of cluster) {
        const beatIds: number[] = [];
        const lostIds: number[] = [];
        for (const q of cluster) {
          if (q.player_id === p.player_id) continue;
          const { winsA, winsB } = mutualHeadToHeadWins(p.player_id, q.player_id, resultsByMatch);
          if (winsA > winsB) beatIds.push(q.player_id);
          else if (winsB > winsA) lostIds.push(q.player_id);
        }
        const byStandingsOrder = (idA: number, idB: number) =>
          indexOfPlayer(idA) - indexOfPlayer(idB);
        beatIds.sort(byStandingsOrder);
        lostIds.sort(byStandingsOrder);
        const beatNames = beatIds.map((id) => sorted.find((s) => s.player_id === id)!.player_name);
        const lostNames = lostIds.map((id) => sorted.find((s) => s.player_id === id)!.player_name);
        if (beatNames.length) p.h2h_beat_opponent_names = beatNames;
        if (lostNames.length) p.h2h_lost_opponent_names = lostNames;
      }
    }
    start = end;
  }
}

export class SwissPairingService {
  static async generateFirstRound(tournamentId: number): Promise<void> {
    // Get all registered players
    const players = await DatabaseService.getTournamentPlayers(tournamentId);

    if (players.length < 2) {
      throw new Error('Se necesitan al menos 2 jugadores para generar una ronda');
    }

    // Shuffle players randomly
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // Create round
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: 1,
      status: 'pending',
    });

    // Get tournament config
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const playersPerMatch = tournament.players_per_match;

    // Get players who have already received bye (should be empty for round 1, but keeps logic consistent)
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // Create matches
    let matchNumber = 1;
    for (let i = 0; i < shuffled.length; i += playersPerMatch) {
      const matchPlayers = shuffled.slice(i, i + playersPerMatch);

      // If odd number and last match has only 1 player, give bye
      if (matchPlayers.length === 1 && i === shuffled.length - 1) {
        // Enforce bye history even in random round 1 (for robustness)
        const byePlayerConfig = await DatabaseService.getTournamentConfig(tournamentId);
        const byeSelection = byePlayerConfig?.bye_selection || 'worst';

        // Map to PlayerStanding format to satisfy signature
        const standingInput = matchPlayers.map((p) => ({
          player_id: p.id!,
          player_name: p.name,
          total_points: 0,
          matches_played: 0,
          wins: 0,
          tiebreak_values: {},
          active: true,
          dropout_round: null,
          starts_count: 0,
        }));

        const byePlayer = this.selectByePlayer(standingInput, playersWithBye, byeSelection);

        // Create match with bye (player gets automatic win)
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'completed',
        });

        const scoringSystem = byePlayerConfig?.scoring_system || { 1: 1, 2: 0 };

        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: byePlayer.player_id || matchPlayers[0].id!,
          position: 1,
          points: 0,
          tournament_points: scoringSystem[1] || 1,
        });

        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      } else {
        // Randomly select start player for the first round
        const startPlayerIndex = Math.floor(Math.random() * matchPlayers.length);
        const startPlayerId = matchPlayers[startPlayerIndex].id!;

        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: startPlayerId,
        });

        // Assign players to match
        const playerIds = matchPlayers.map((p) => p.id!);
        await DatabaseService.setMatchPlayers(matchId, playerIds);
      }

      matchNumber++;
    }

    // Update tournament status
    await DatabaseService.updateTournament(tournamentId, { status: 'in_progress' });
  }

  static async previewFirstRound(tournamentId: number): Promise<{
    matches: Array<{
      player1: Player & { player_name: string; player_id: number };
      player2?: Player & { player_name: string; player_id: number };
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>;
    previousOpponents: Record<number, number[]>;
  }> {
    const players = await DatabaseService.getTournamentPlayers(tournamentId);

    if (players.length < 2) {
      throw new Error('Se necesitan al menos 2 jugadores para generar una ronda');
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const playersPerMatch = tournament.players_per_match;

    const matches: Array<{
      player1: Player & { player_name: string; player_id: number };
      player2?: Player & { player_name: string; player_id: number };
      startPlayerId?: number;
      reason?: string;
    }> = [];
    const startStats: Record<number, { totalStarts: number; lastStartRound: number }> = {};

    // Initialize stats
    players.forEach((p) => {
      startStats[p.id!] = { totalStarts: 0, lastStartRound: 0 };
    });

    for (let i = 0; i < shuffled.length; i += playersPerMatch) {
      const matchPlayers = shuffled.slice(i, i + playersPerMatch);

      if (matchPlayers.length === 1 && i === shuffled.length - 1) {
        // Bye match
        matches.push({
          player1: {
            ...matchPlayers[0],
            player_name: matchPlayers[0].name,
            player_id: matchPlayers[0].id!,
          },
          reason: 'random',
        });
      } else {
        // Match with players
        // Random start player
        const startPlayerIndex = Math.floor(Math.random() * matchPlayers.length);
        const startPlayerId = matchPlayers[startPlayerIndex].id!;

        matches.push({
          player1: {
            ...matchPlayers[0],
            player_name: matchPlayers[0].name,
            player_id: matchPlayers[0].id!,
          },
          player2: {
            ...matchPlayers[1],
            player_name: matchPlayers[1].name,
            player_id: matchPlayers[1].id!,
          },
          startPlayerId,
          reason: 'random',
        });
      }
    }

    return { matches, warnings: [], startStats, previousOpponents: {} };
  }

  static async createRoundFromPairings(
    tournamentId: number,
    roundNumber: number,
    pairings: Array<{
      player1: { id?: number; player_id?: number };
      player2?: { id?: number; player_id?: number };
      startPlayerId?: number;
    }>
  ): Promise<void> {
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: roundNumber,
      status: 'pending',
    });

    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };

    let matchNumber = 1;
    for (const pairing of pairings) {
      if (!pairing.player2) {
        // Bye match
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'completed',
        });

        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: (pairing.player1.player_id || pairing.player1.id) as number,
          position: 1,
          points: 0,
          tournament_points: scoringSystem[1] || 1,
        });

        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

        // Add bye record
        // Note: In a real scenario we might need to know the *next* round to mark the bye properly in history,
        // but here we are just creating the current round.
        // Logic in generateNextRound handles historical bye checking.
        // If we really need to record the bye for history:
        await DatabaseService.addPlayerBye(
          tournamentId,
          (pairing.player1.player_id || pairing.player1.id) as number,
          roundNumber
        );
      } else {
        // Regular match
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: pairing.startPlayerId,
        });

        await DatabaseService.setMatchPlayers(matchId, [
          (pairing.player1.player_id || pairing.player1.id) as number,
          (pairing.player2.player_id || pairing.player2.id) as number,
        ]);
      }
      matchNumber++;
    }

    await DatabaseService.updateTournament(tournamentId, { status: 'in_progress' });
  }

  static async generateNextRound(tournamentId: number): Promise<{ standings: PlayerStanding[] }> {
    const [rounds, tournamentData, players, config, startStatsData] = await Promise.all([
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentPlayers(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
      DatabaseService.getPlayerStartStatistics(tournamentId),
    ]);
    const tournament = tournamentData as Tournament | null;
    if (!tournament) throw new Error('Torneo no encontrado');

    const startStats = startStatsData;

    const lastRound = rounds[rounds.length - 1];
    if (!lastRound || lastRound.status !== 'completed') {
      throw new Error('La ronda anterior debe estar completada');
    }

    const numberOfRounds = tournament.number_of_rounds || calculateNumberOfRounds(players.length);
    const swissRoundCount = rounds.filter((r) => (r.phase ?? 'swiss') === 'swiss').length;
    if (swissRoundCount >= numberOfRounds) {
      throw new Error(`Se ha alcanzado el número máximo de rondas (${numberOfRounds})`);
    }

    const roundMatches = await Promise.all(
      rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
    );
    const allMatches = roundMatches.flat();
    const allResults = await Promise.all(
      allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
    );
    const resultsByMatch: Record<number, MatchResult[]> = {};
    allMatches.forEach((m, i) => {
      resultsByMatch[m.id!] = allResults[i] || [];
    });

    const standings = await this.calculateStandings(
      tournamentId,
      config?.tiebreak_criteria || [],
      { players, rounds, roundMatches, resultsByMatch },
      config?.player_display_mode
    );
    const previousOpponents = await DatabaseService.getTournamentOpponents(tournamentId);

    // Create new round
    const nextRoundNumber = rounds.length + 1;
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: nextRoundNumber,
      status: 'pending',
    });

    // Pair players
    const playersPerMatch = tournament.players_per_match;
    let matchNumber = 1;

    // Get bye selection method from config
    const byeSelection = config?.bye_selection || 'worst';

    // Get players who have already received bye
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // PROCESS PARTIALLY REFACTORED LOOP
    // Collect all players to be paired (after handling bye)
    let allAvailable = standings.filter((p) => p.active);

    // Handle byes IF total players is not a multiple of playersPerMatch
    while (allAvailable.length % playersPerMatch !== 0) {
      const byePlayer = this.selectByePlayer(allAvailable, playersWithBye, byeSelection);

      const byeMatchId = await DatabaseService.createMatch({
        round_id: roundId,
        match_number: matchNumber,
        status: 'completed',
      });

      const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };

      await DatabaseService.createMatchResult({
        match_id: byeMatchId,
        player_id: byePlayer.player_id,
        position: 1,
        points: 0,
        tournament_points: scoringSystem[1] || 1,
      });

      await DatabaseService.updateMatch(byeMatchId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      await DatabaseService.addPlayerBye(tournamentId, byePlayer.player_id, nextRoundNumber);
      playersWithBye.add(byePlayer.player_id);
      allAvailable = allAvailable.filter((p) => p.player_id !== byePlayer.player_id);
      matchNumber++;
    }

    // Compute Pairings using unified helper
    const { pairings } = await this.computePairings(
      allAvailable,
      previousOpponents,
      playersPerMatch,
      config,
      startStats
    );

    for (const p of pairings) {
      const matchId = await DatabaseService.createMatch({
        round_id: roundId,
        match_number: matchNumber,
        status: 'pending',
        first_player_id: p.startPlayerId,
      });

      const playerIds = p.players.map((item) => item.player_id);
      await DatabaseService.setMatchPlayers(matchId, playerIds);
      matchNumber++;
    }

    return { standings };
  }

  static async previewNextRound(tournamentId: number): Promise<{
    matches: Array<{
      player1: PlayerStanding;
      player2?: PlayerStanding;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>;
    previousOpponents: Record<number, number[]>;
  }> {
    const [rounds, tournamentData, players, config, startStatsData] = await Promise.all([
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentPlayers(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
      DatabaseService.getPlayerStartStatistics(tournamentId),
    ]);
    const tournament = tournamentData as Tournament | null;
    if (!tournament) throw new Error('Torneo no encontrado');
    const startStats = startStatsData;

    const roundMatches = await Promise.all(
      rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
    );
    const allMatches = roundMatches.flat();
    const allResults = await Promise.all(
      allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
    );
    const resultsByMatch: Record<number, MatchResult[]> = {};
    allMatches.forEach((m, i) => {
      resultsByMatch[m.id!] = allResults[i] || [];
    });

    const standings = await this.calculateStandings(
      tournamentId,
      config?.tiebreak_criteria || [],
      { players, rounds, roundMatches, resultsByMatch },
      config?.player_display_mode
    );
    const previousOpponents = await DatabaseService.getTournamentOpponents(tournamentId);

    const playersPerMatch = tournament.players_per_match;
    const proposedMatches: Array<{
      player1: PlayerStanding;
      player2?: PlayerStanding;
      startPlayerId?: number;
      reason?: string;
    }> = [];
    const warnings: string[] = [];

    const byeSelection = config?.bye_selection || 'worst';
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // Collect all players to be paired (after handling bye)
    let allAvailable = standings.filter((p) => p.active);

    // Handle byes IF total players is not a multiple of playersPerMatch
    while (allAvailable.length % playersPerMatch !== 0) {
      const byePlayer = this.selectByePlayer(allAvailable, playersWithBye, byeSelection);

      proposedMatches.push({
        player1: byePlayer,
      });

      playersWithBye.add(byePlayer.player_id);
      allAvailable = allAvailable.filter((p) => p.player_id !== byePlayer.player_id);
    }

    // Compute Pairings using unified helper
    const { pairings, warnings: pairingWarnings } = await this.computePairings(
      allAvailable,
      previousOpponents,
      playersPerMatch,
      config,
      startStats
    );

    warnings.push(...pairingWarnings);

    for (const p of pairings) {
      proposedMatches.push({
        player1: p.players[0],
        player2: p.players[1],
        startPlayerId: p.startPlayerId,
        reason: p.reason,
      });
    }

    return { matches: proposedMatches, warnings, startStats, previousOpponents };
  }

  /**
   * Internal helper to compute pairings using either backtracking or greedy algorithm.
   * Centralizes logic to avoid divergence between preview and live generation.
   */
  private static async computePairings(
    availablePlayers: PlayerStanding[],
    previousOpponents: Record<number, number[]>,
    playersPerMatch: number,
    config: TournamentConfig | null,
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>
  ): Promise<{
    pairings: Array<{
      players: PlayerStanding[];
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    previousOpponents: Record<number, number[]>;
  }> {
    const pairings: Array<{
      players: PlayerStanding[];
      startPlayerId?: number;
      reason?: string;
    }> = [];
    const warnings: string[] = [];

    const avoidRematches = config?.avoid_rematches ?? true;
    const useBacktrackingSearch = avoidRematches;

    let results: PlayerStanding[][] | null = null;
    const sortedAvailable = [...availablePlayers].sort((a, b) => b.total_points - a.total_points);

    if (useBacktrackingSearch) {
      const n = sortedAvailable.length;
      const maxRematchBudget = Math.min(
        40,
        Math.max(8, Math.ceil(n / 2) + (playersPerMatch > 2 ? Math.min(n, 12) : 0))
      );
      console.log(`[Swiss] Starting robust backtracking for ${n} players...`);
      for (let maxRematches = 0; maxRematches <= maxRematchBudget; maxRematches++) {
        results = this.findBestPairings(
          sortedAvailable,
          previousOpponents,
          playersPerMatch,
          maxRematches
        );
        if (results) {
          console.log(`[Swiss] Found solution with ${maxRematches} total rematches.`);
          break;
        }
      }
    }

    if (results) {
      for (const matchPlayers of results) {
        const { startPlayerId, reason } = this.determineStartPlayer(matchPlayers, startStats);
        pairings.push({ players: matchPlayers, startPlayerId, reason });
      }
    } else {
      // Greedy logic (used as primary or fallback)
      if (useBacktrackingSearch) {
        warnings.push(i18n.t('tournaments.preview.backtracking_failed'));
      }

      const { pointGroups, sortedPoints } = this.groupPlayersByPoints(availablePlayers);
      const remainingGreedy = [];
      for (const points of sortedPoints) {
        remainingGreedy.push(...pointGroups[points]);
      }

      while (remainingGreedy.length >= playersPerMatch) {
        const matchPlayers = [remainingGreedy.shift()!];

        // Fill the match
        while (matchPlayers.length < playersPerMatch && remainingGreedy.length > 0) {
          let bestCandidateIndex = 0;
          if (avoidRematches) {
            // Find a candidate that hasn't played against ANY of the current match members
            for (let i = 0; i < remainingGreedy.length; i++) {
              const candidate = remainingGreedy[i];
              const isRematch = matchPlayers.some((p) => {
                const opps = previousOpponents[p.player_id] || [];
                return opps.includes(candidate.player_id);
              });

              if (!isRematch) {
                bestCandidateIndex = i;
                break;
              }
            }
          }

          const chosen = remainingGreedy.splice(bestCandidateIndex, 1)[0];
          matchPlayers.push(chosen);
        }

        // Check if the final match has rematches to warn the user
        const hasAnyRematch = matchPlayers.some((p, idx) => {
          const others = matchPlayers.slice(idx + 1);
          const opps = previousOpponents[p.player_id] || [];
          return others.some((o) => opps.includes(o.player_id));
        });

        if (hasAnyRematch) {
          warnings.push(
            i18n.t('tournaments.preview.rematch_inevitable_generic', {
              match: matchPlayers.map((p) => p.player_name).join(' vs '),
            })
          );
        }

        const { startPlayerId, reason } = this.determineStartPlayer(matchPlayers, startStats);
        pairings.push({ players: matchPlayers, startPlayerId, reason });
      }
    }

    return { pairings, warnings, previousOpponents };
  }

  /**
   * Recursive backtracking that tries to find a pairing solution with a maximum number of rematches.
   * This is used with Iterative Deepening (0 rematches, then 1, etc.) to find the best possible outcome.
   */
  private static findBestPairings(
    remaining: PlayerStanding[],
    previousOpponents: Record<number, number[]>,
    playersPerMatch: number,
    maxTotalRematches: number,
    currentRematches: number = 0
  ): PlayerStanding[][] | null {
    if (remaining.length === 0) return [];
    if (remaining.length < playersPerMatch) return null;

    const first = remaining[0];
    const rest = remaining.slice(1);
    const k = playersPerMatch - 1;

    // For N=2 we must try every possible partner; a truncated window can miss valid 0-rematch pairings
    // and fall back to greedy (more rematches). For N>2 keep a bounded window for performance.
    const searchWindowSize = Math.max(15, Math.floor(rest.length / 2));
    const searchWindow =
      playersPerMatch === 2 ? rest.length : Math.min(rest.length, searchWindowSize);

    if (playersPerMatch === 2) {
      for (let i = 0; i < searchWindow; i++) {
        const second = rest[i];
        const opps = previousOpponents[first.player_id] || [];
        const isRematch = opps.includes(second.player_id);
        const matchRematches = isRematch ? 1 : 0;

        if (currentRematches + matchRematches <= maxTotalRematches) {
          const subRemaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
          const result = this.findBestPairings(
            subRemaining,
            previousOpponents,
            playersPerMatch,
            maxTotalRematches,
            currentRematches + matchRematches
          );

          if (result) {
            return [[first, second], ...result];
          }
        }
      }
    } else {
      const countRematchesInMatch = (matchPlayers: PlayerStanding[]): number => {
        let m = 0;
        for (let j = 0; j < matchPlayers.length; j++) {
          const p = matchPlayers[j];
          const others = matchPlayers.slice(j + 1);
          const opps = previousOpponents[p.player_id] || [];
          m += others.filter((o) => opps.includes(o.player_id)).length;
        }
        return m;
      };

      const comboCount = binomial(rest.length, k);
      const useComboEnumeration =
        k > 0 && comboCount <= 4000 && (remaining.length <= 16 || comboCount <= 600);

      if (useComboEnumeration) {
        for (const combo of combinationsOf(rest, k)) {
          const matchPlayers = [first, ...combo];
          const matchRematches = countRematchesInMatch(matchPlayers);
          if (currentRematches + matchRematches <= maxTotalRematches) {
            const comboIds = new Set(combo.map((p) => p.player_id));
            const subRemaining = rest.filter((p) => !comboIds.has(p.player_id));
            const result = this.findBestPairings(
              subRemaining,
              previousOpponents,
              playersPerMatch,
              maxTotalRematches,
              currentRematches + matchRematches
            );
            if (result) {
              return [matchPlayers, ...result];
            }
          }
        }
      } else {
        for (let i = 0; i <= searchWindow - k; i++) {
          const candidates = rest.slice(i, i + k);
          const matchPlayers = [first, ...candidates];
          const matchRematches = countRematchesInMatch(matchPlayers);

          if (currentRematches + matchRematches <= maxTotalRematches) {
            const subRemaining = [...rest.slice(0, i), ...rest.slice(i + k)];
            const result = this.findBestPairings(
              subRemaining,
              previousOpponents,
              playersPerMatch,
              maxTotalRematches,
              currentRematches + matchRematches
            );

            if (result) {
              return [matchPlayers, ...result];
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Selects the most appropriate player to receive a bye, enforcing the primary constraint
   * that a player should NOT receive more than one bye in a tournament.
   * If all candidates already had a bye, it falls back to the default rules.
   */
  private static selectByePlayer(
    remaining: PlayerStanding[],
    playersWithBye: Set<number>,
    byeSelection: string
  ): PlayerStanding {
    if (remaining.length === 0) throw new Error('No players available for bye');
    if (remaining.length === 1) return remaining[0];

    const candidatesWithoutBye = remaining.filter((p) => !playersWithBye.has(p.player_id));

    // Fallback: If ALL players already had a bye, we must pick from the pool of all remaining players
    const pool = candidatesWithoutBye.length > 0 ? candidatesWithoutBye : remaining;

    if (byeSelection === 'random') {
      return pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Both 'worst' and 'round_robin' modes default to the worst player in the current pool.
      // Since `remaining` is sorted by points descending, the worst player is at the end.
      return pool[pool.length - 1];
    }
  }

  private static groupPlayersByPoints(standings: PlayerStanding[]): {
    pointGroups: { [points: number]: PlayerStanding[] };
    sortedPoints: number[];
  } {
    // Group players by similar points
    // For late entries (0 points), ensure they are included but not strictly forced into a bye if other options exist with 0 points
    const activeStandings = standings.filter((s) => s.active);

    const pointGroups: { [points: number]: PlayerStanding[] } = {};
    activeStandings.forEach((standing) => {
      const points = Math.floor(standing.total_points);
      if (!pointGroups[points]) {
        pointGroups[points] = [];
      }
      pointGroups[points].push(standing);
    });

    // Shuffle each group to avoid predictable pairings and local minima in the search
    Object.keys(pointGroups).forEach((points) => {
      pointGroups[Number(points)].sort(() => Math.random() - 0.5);
    });

    // Pair within groups
    // Optimization: If the last group (likely 0 points) has an odd number of players,
    // and the total number of remaining players is even (meaning a bye is NOT strictly necessary for the tournament),
    // we should try to merge the last two groups to avoid forcing a bye on the 0-point player.
    // This happens when late entries (0 points) are odd (e.g. 1 new player) but total players are even (odd previously + 1 new = even).

    const sortedPoints = Object.keys(pointGroups)
      .map(Number)
      .sort((a, b) => b - a);

    // Check if we need to merge the last group to avoid unnecessary bye
    const totalActivePlayers = activeStandings.length;
    if (totalActivePlayers % 2 === 0 && sortedPoints.length >= 2) {
      const lastPoints = sortedPoints[sortedPoints.length - 1];
      const lastGroup = pointGroups[lastPoints];
      if (lastGroup.length % 2 !== 0) {
        // Merge last group into the second to last group
        const secondLastPoints = sortedPoints[sortedPoints.length - 2];
        pointGroups[secondLastPoints] = [...pointGroups[secondLastPoints], ...lastGroup];
        delete pointGroups[lastPoints];
        sortedPoints.pop(); // Remove last points key
      }
    }

    return { pointGroups, sortedPoints };
  }

  /** Mismas reglas que el emparejamiento automático: equilibrio de inicios, antigüedad y azar. */
  static async pickStartPlayerForPair(
    playerId1: number,
    playerId2: number,
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>
  ): Promise<number> {
    const { startPlayerId } = this.determineStartPlayer(
      [{ player_id: playerId1 }, { player_id: playerId2 }],
      startStats
    );
    return startPlayerId;
  }

  private static determineStartPlayer(
    players: { player_id: number; player_name?: string }[],
    stats: { [playerId: number]: { totalStarts: number; lastStartRound: number } }
  ): { startPlayerId: number; reason: 'balance' | 'recency' | 'azar' } {
    if (players.length === 0) return { startPlayerId: -1, reason: 'azar' };
    if (players.length === 1) return { startPlayerId: players[0].player_id, reason: 'balance' };

    const sortedByStarts = [...players].sort((a, b) => {
      const statsA = stats[a.player_id] || { totalStarts: 0, lastStartRound: 0 };
      const statsB = stats[b.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return statsA.totalStarts - statsB.totalStarts;
    });

    const minStarts = (stats[sortedByStarts[0].player_id] || { totalStarts: 0 }).totalStarts;
    const candidatesByStarts = sortedByStarts.filter((p) => {
      const pStats = stats[p.player_id] || { totalStarts: 0 };
      return pStats.totalStarts === minStarts;
    });

    if (candidatesByStarts.length === 1) {
      return { startPlayerId: candidatesByStarts[0].player_id, reason: 'balance' };
    }

    const sortedByRecency = [...candidatesByStarts].sort((a, b) => {
      const statsA = stats[a.player_id] || { totalStarts: 0, lastStartRound: 0 };
      const statsB = stats[b.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return statsA.lastStartRound - statsB.lastStartRound;
    });

    const minLastRound = (
      stats[sortedByRecency[0].player_id] || { totalStarts: 0, lastStartRound: 0 }
    ).lastStartRound;
    const candidatesByRecency = sortedByRecency.filter((p) => {
      const pStats = stats[p.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return pStats.lastStartRound === minLastRound;
    });

    if (candidatesByRecency.length === 1) {
      return { startPlayerId: candidatesByRecency[0].player_id, reason: 'recency' };
    }

    const randomIndex = Math.floor(Math.random() * candidatesByRecency.length);
    return { startPlayerId: candidatesByRecency[randomIndex].player_id, reason: 'azar' };
  }

  static async calculateStandings(
    tournamentId: number,
    tiebreakCriteria: TiebreakCriterion[],
    preFetchedData?: {
      players?: Player[];
      rounds?: Round[];
      roundMatches?: Match[][];
      resultsByMatch?: Record<number, MatchResult[]>;
      numberOfRounds?: number;
      buchholzByeMode?: BuchholzByeMode;
    },
    playerDisplayMode: PlayerDisplayMode = 'per_player'
  ): Promise<PlayerStanding[]> {
    // Use config order for tiebreak criteria
    const criteria = [...(tiebreakCriteria || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const players =
      preFetchedData?.players || (await DatabaseService.getTournamentPlayers(tournamentId));
    const rounds =
      preFetchedData?.rounds || (await DatabaseService.getTournamentRounds(tournamentId));

    let roundMatches: Match[] = [];
    let resultsByMatch: Record<number, MatchResult[]> = {};
    let roundMatchesByRound: Match[][] = [];

    if (preFetchedData?.roundMatches && preFetchedData.resultsByMatch) {
      resultsByMatch = preFetchedData.resultsByMatch;
      const order = [...rounds]
        .map((r, i) => ({ r, i }))
        .sort((a, b) => a.r.round_number - b.r.round_number);
      roundMatchesByRound = order.map((x) => preFetchedData.roundMatches![x.i] || []);
      roundMatches = roundMatchesByRound.flat();
    } else {
      const roundsSorted = [...rounds].sort((a, b) => a.round_number - b.round_number);
      roundMatchesByRound = await Promise.all(
        roundsSorted.map((r) => DatabaseService.getRoundMatches(r.id!))
      );
      roundMatches = roundMatchesByRound.flat();
      const allResults = await Promise.all(
        roundMatches.map((m) => DatabaseService.getMatchResults(m.id!))
      );
      resultsByMatch = {};
      roundMatches.forEach((m, i) => {
        resultsByMatch[m.id!] = (allResults[i] || []) as MatchResult[];
      });
    }

    const roundsSorted = [...rounds].sort((a, b) => a.round_number - b.round_number);

    // Initialize standings
    const standings: Record<number, PlayerStanding> = {};
    players.forEach((player: Player) => {
      const pid = player.id!;
      standings[pid] = {
        player_id: pid,
        player_name: getPlayerDisplayName(player, playerDisplayMode),
        total_points: 0,
        matches_played: 0,
        wins: 0,
        tiebreak_values: {},
        active: (player as unknown as { active: boolean }).active ?? true,
        dropout_round:
          (player as unknown as { dropout_round: number | null }).dropout_round ?? null,
        starts_count: 0,
      };
    });

    // Count first player starts
    roundMatches.forEach((match) => {
      if (match.first_player_id && standings[match.first_player_id]) {
        standings[match.first_player_id].starts_count =
          (standings[match.first_player_id].starts_count || 0) + 1;
      }
    });

    // Process all match results
    Object.values(resultsByMatch)
      .flat()
      .forEach((result: MatchResult) => {
        const pid = result.player_id;
        if (standings[pid]) {
          standings[pid].matches_played++;
          standings[pid].total_points += result.tournament_points;
          if (result.position === 1) {
            standings[pid].wins++;
          }
        }
      });

    const standingsList = Object.values(standings);
    const tournamentPointsAverage =
      standingsList.length > 0
        ? standingsList.reduce((s, x) => s + x.total_points, 0) / standingsList.length
        : 0;

    let buchholzMode: BuchholzByeMode = 'legacy';
    if (preFetchedData?.buchholzByeMode !== undefined) {
      buchholzMode = normalizeBuchholzByeMode(preFetchedData.buchholzByeMode);
    } else {
      const cfg = await DatabaseService.getTournamentConfig(tournamentId);
      buchholzMode = normalizeBuchholzByeMode(cfg?.buchholz_bye_mode);
    }

    let scheduledN = preFetchedData?.numberOfRounds ?? 0;
    if (scheduledN < 1) {
      const tour = await DatabaseService.getTournamentById(tournamentId);
      scheduledN = tour?.number_of_rounds ?? 0;
    }
    const maxRoundNo = rounds.length > 0 ? Math.max(...rounds.map((r) => r.round_number)) : 0;
    const numberOfRounds = Math.max(1, scheduledN, maxRoundNo, rounds.length);

    // Calculate tiebreakers
    for (const criterion of criteria) {
      if (!criterion.enabled) continue;

      const calculatedInfo = TiebreakService.calculate(
        criterion.id,
        standingsList,
        roundsSorted,
        roundMatchesByRound,
        resultsByMatch,
        players,
        {
          buchholzByeMode: buchholzMode,
          numberOfRounds,
          tournamentPointsAverage,
        }
      );

      Object.keys(calculatedInfo).forEach((playerId) => {
        const pid = Number(playerId);
        if (standings[pid]) {
          standings[pid].tiebreak_values[criterion.id] = calculatedInfo[pid];
        }
      });
    }

    const h2hClusterMeta = buildHeadToHeadClusterMeta(standingsList, criteria, resultsByMatch);
    const pairCtx: StandingsPairCompareContext = {
      criteria,
      resultsByMatch,
      ...h2hClusterMeta,
    };
    const sortedStandings = Object.values(standings).sort((a, b) =>
      compareStandingsPair(a, b, pairCtx)
    );
    const h2hEnabled = criteria.some((c) => c.enabled && c.id === 'head_to_head');
    if (h2hEnabled) {
      annotateHeadToHeadGroupDisplay(sortedStandings, pairCtx);
    }
    return sortedStandings;
  }
}
