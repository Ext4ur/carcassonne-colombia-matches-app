import { DatabaseService } from './database';
import { SwissPairingService } from './swiss';
import {
  buildFirstKnockoutPairings,
  buildNextKnockoutPairings,
  canStartKnockoutPhase,
  computeSeriesState,
  countSwissRounds,
  isKnockoutMatchComplete,
  isKnockoutPhaseActive,
  resolveKnockoutGameStarter,
  serializeSeriesMeta,
  seriesTargetForConfig,
  tournamentHasKnockoutChampion,
} from './knockout';
import type { KnockoutSeries, KnockoutSize } from '../types/knockout';
import { isKnockoutSize, resolveEffectiveKnockoutSize } from '../types/knockout';
import type {
  Match,
  MatchResult,
  PlayerStanding,
  Tournament,
  TournamentConfig,
} from '../types/tournament';
import { calculateNumberOfRounds } from '../utils/tournament';

export class RoundGenerationService {
  static async getEffectiveMaxSwissRounds(tournament: Tournament): Promise<number> {
    const players = await DatabaseService.getTournamentPlayers(tournament.id!);
    if (tournament.number_of_rounds) return tournament.number_of_rounds;
    return calculateNumberOfRounds(players.length);
  }

  static async canGenerateSwissNextRound(tournamentId: number): Promise<boolean> {
    const [tournament, rounds] = await Promise.all([
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentRounds(tournamentId),
    ]);
    if (!tournament) return false;
    if (isKnockoutPhaseActive(tournament, rounds)) return false;
    const maxSwiss = await this.getEffectiveMaxSwissRounds(tournament);
    return countSwissRounds(rounds) < maxSwiss;
  }

  static async previewNextRound(tournamentId: number) {
    const tournament = await DatabaseService.getTournamentById(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    if (!tournament) throw new Error('Torneo no encontrado');

    if (isKnockoutPhaseActive(tournament, rounds)) {
      throw new Error('knockout_phase_active');
    }
    return SwissPairingService.previewNextRound(tournamentId);
  }

  static async generateNextRound(tournamentId: number): Promise<{ standings: PlayerStanding[] }> {
    const tournament = await DatabaseService.getTournamentById(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    if (!tournament) throw new Error('Torneo no encontrado');

    if (isKnockoutPhaseActive(tournament, rounds)) {
      return KnockoutPairingService.generateNextKnockoutRound(tournamentId);
    }
    return SwissPairingService.generateNextRound(tournamentId);
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
    const tournament = await DatabaseService.getTournamentById(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    if (!tournament) throw new Error('Torneo no encontrado');
    if (isKnockoutPhaseActive(tournament, rounds)) {
      throw new Error('knockout_phase_active');
    }
    return SwissPairingService.createRoundFromPairings(tournamentId, roundNumber, pairings);
  }

  static async canFinalizeTournament(tournamentId: number): Promise<boolean> {
    const [tournament, rounds, config] = await Promise.all([
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
    ]);
    if (!tournament) return false;

    if (tournament.competition_format === 'swiss_knockout') {
      if (!isKnockoutPhaseActive(tournament, rounds)) return false;
      const roundMatches = await Promise.all(
        rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
      );
      const allMatches = roundMatches.flat();
      const allResults = await Promise.all(
        allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
      );
      const resultsByMatch: Record<number, MatchResult[]> = {};
      const playersByMatch: Record<number, number[]> = {};
      allMatches.forEach((m, i) => {
        resultsByMatch[m.id!] = allResults[i] || [];
      });
      for (const m of allMatches) {
        playersByMatch[m.id!] = (await DatabaseService.getMatchPlayers(m.id!)).map((p) => p.id!);
      }
      const matchesByRound = new Map<number, Match[]>();
      rounds.forEach((r, i) => {
        if (r.id) matchesByRound.set(r.id, roundMatches[i] ?? []);
      });
      if (
        !tournamentHasKnockoutChampion(
          rounds,
          matchesByRound,
          resultsByMatch,
          playersByMatch,
          Boolean(config?.knockout_play_bronze_match)
        )
      ) {
        return false;
      }
      const lastKo = [...rounds].reverse().find((r) => r.phase === 'knockout');
      if (!lastKo || lastKo.status !== 'completed') return false;
      return true;
    }

    const maxSwiss = await this.getEffectiveMaxSwissRounds(tournament);
    const swissDone =
      countSwissRounds(rounds) >= maxSwiss && rounds.every((r) => r.status === 'completed');
    return swissDone;
  }

  static async canStartKnockout(tournamentId: number): Promise<{
    ok: boolean;
    reason?: string;
    knockoutSize?: KnockoutSize;
    configuredKnockoutSize?: KnockoutSize;
    effectiveSize?: KnockoutSize;
  }> {
    const [tournament, rounds, config] = await Promise.all([
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
    ]);
    if (!tournament || !config) return { ok: false, reason: 'missing' };
    const activeCount = (
      await SwissPairingService.calculateStandings(tournamentId, config.tiebreak_criteria || [])
    ).filter((s) => s.active).length;
    const size = config.knockout_size ?? 8;
    if (!isKnockoutSize(size)) return { ok: false, reason: 'invalid_size' };
    const check = canStartKnockoutPhase(tournament, rounds, activeCount, size);
    return {
      ...check,
      knockoutSize: check.effectiveSize ?? size,
      configuredKnockoutSize: size,
    };
  }
}

export class KnockoutPairingService {
  private static async persistKnockoutMatchStarter(
    tournamentId: number,
    matchId: number,
    playerIds: [number, number],
    config: TournamentConfig
  ): Promise<void> {
    const seeds = await DatabaseService.getKnockoutSeeds(tournamentId);
    const seedByPlayer = new Map(seeds.map((s) => [s.player_id, s.seed] as const));
    const targetWins = seriesTargetForConfig(
      (config.knockout_series ?? 'best_of_1') as KnockoutSeries
    );
    const seriesState = computeSeriesState(
      { round_id: 0, match_number: 0, status: 'pending', series_target_wins: targetWins },
      [],
      playerIds
    );
    const starter = resolveKnockoutGameStarter(1, playerIds, {
      matchStarter: config.knockout_match_starter ?? 'higher_swiss_seed',
      seriesStarterMode: config.knockout_series_starter_mode,
      alternateStarter: Boolean(config.knockout_series_alternate_starter),
      seedByPlayer,
      seriesState,
      existingStarters: {},
    });
    await DatabaseService.updateMatch(matchId, {
      first_player_id: starter,
      series_meta: serializeSeriesMeta({ gameStarters: { 1: starter } }),
    });
  }

  static async startKnockoutPhase(tournamentId: number): Promise<void> {
    const check = await RoundGenerationService.canStartKnockout(tournamentId);
    if (!check.ok) throw new Error(check.reason || 'cannot_start_knockout');

    const [tournament, config] = await Promise.all([
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
    ]);
    if (!tournament || !config) throw new Error('Torneo no encontrado');

    const configuredSize = (config.knockout_size ?? 8) as KnockoutSize;
    const standings = await SwissPairingService.calculateStandings(
      tournamentId,
      config.tiebreak_criteria || [],
      undefined,
      config.player_display_mode
    );
    const activeCount = standings.filter((s) => s.active).length;
    const knockoutSize: KnockoutSize =
      check.knockoutSize ??
      resolveEffectiveKnockoutSize(configuredSize, activeCount) ??
      configuredSize;
    const series = (config.knockout_series ?? 'best_of_1') as KnockoutSeries;

    const snapshot = JSON.stringify(standings);
    await DatabaseService.updateTournamentConfig(tournamentId, {
      swiss_standings_snapshot: snapshot,
    });

    const { pairings, stage, seeds } = buildFirstKnockoutPairings(standings, knockoutSize, series);

    await DatabaseService.clearKnockoutSeeds(tournamentId);
    for (const s of seeds) {
      await DatabaseService.addKnockoutSeed(tournamentId, s.player_id, s.seed);
    }

    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const roundNumber = rounds.length + 1;
    const targetWins = seriesTargetForConfig(series);

    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: roundNumber,
      status: 'pending',
      phase: 'knockout',
      knockout_stage: stage,
    });

    let matchNumber = 1;
    for (const p of pairings) {
      const matchId = await DatabaseService.createMatch({
        round_id: roundId,
        match_number: matchNumber,
        status: 'pending',
        knockout_bracket_slot: p.bracketSlot,
        series_target_wins: targetWins,
        is_knockout: true,
      });
      await DatabaseService.setMatchPlayers(matchId, [p.player1Id, p.player2Id]);
      await this.persistKnockoutMatchStarter(
        tournamentId,
        matchId,
        [p.player1Id, p.player2Id],
        config
      );
      matchNumber++;
    }

    await DatabaseService.updateTournament(tournamentId, {
      knockout_phase_started_at: new Date().toISOString(),
      status: 'in_progress',
    });
  }

  static async generateNextKnockoutRound(
    tournamentId: number
  ): Promise<{ standings: PlayerStanding[] }> {
    const [tournament, rounds, config] = await Promise.all([
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
    ]);
    if (!tournament || !config) throw new Error('Torneo no encontrado');

    const koRounds = rounds.filter((r) => r.phase === 'knockout');
    const lastKo = koRounds[koRounds.length - 1];
    if (!lastKo?.id || lastKo.status !== 'completed') {
      throw new Error('La ronda eliminatoria anterior debe estar completada');
    }

    const matches = await DatabaseService.getRoundMatches(lastKo.id);
    const series = (config.knockout_series ?? 'best_of_1') as KnockoutSeries;
    const targetWins = seriesTargetForConfig(series);

    const winners: Array<{ bracketSlot: number; winnerId: number }> = [];
    const losers: Array<{ bracketSlot: number; loserId: number }> = [];
    for (const m of matches) {
      const results = await DatabaseService.getMatchResults(m.id!);
      const playerIds = (await DatabaseService.getMatchPlayers(m.id!)).map((p) => p.id!);
      if (playerIds.length !== 2) {
        throw new Error('Partido eliminatorio inválido');
      }
      if (!isKnockoutMatchComplete(m, results, playerIds)) {
        throw new Error('Hay cruces eliminatorios sin cerrar');
      }
      const winnerId =
        m.series_winner_id ??
        (await import('./knockout')).computeSeriesState(m, results, playerIds as [number, number])
          .winnerId;
      if (!winnerId) throw new Error('Ganador no determinado');
      const loserId = playerIds.find((id) => id !== winnerId)!;
      winners.push({
        bracketSlot: m.knockout_bracket_slot ?? m.match_number,
        winnerId,
      });
      losers.push({
        bracketSlot: m.knockout_bracket_slot ?? m.match_number,
        loserId,
      });
    }

    if (winners.length <= 1) {
      throw new Error('Ya hay campeón eliminatorio');
    }

    const roundNumber = rounds.length + 1;

    if (winners.length === 2 && lastKo.knockout_stage === 'semifinal') {
      const playBronze = Boolean(config.knockout_play_bronze_match);
      const sortedWinners = [...winners].sort((a, b) => a.bracketSlot - b.bracketSlot);
      const sortedLosers = [...losers].sort((a, b) => a.bracketSlot - b.bracketSlot);

      const roundId = await DatabaseService.createRound({
        tournament_id: tournamentId,
        round_number: roundNumber,
        status: 'pending',
        phase: 'knockout',
        knockout_stage: 'final',
      });

      const finalMatchId = await DatabaseService.createMatch({
        round_id: roundId,
        match_number: 1,
        status: 'pending',
        knockout_bracket_slot: 1,
        series_target_wins: targetWins,
        is_knockout: true,
        knockout_match_stage: 'final',
      });
      await DatabaseService.setMatchPlayers(finalMatchId, [
        sortedWinners[0]!.winnerId,
        sortedWinners[1]!.winnerId,
      ]);
      await this.persistKnockoutMatchStarter(
        tournamentId,
        finalMatchId,
        [sortedWinners[0]!.winnerId, sortedWinners[1]!.winnerId],
        config
      );

      if (playBronze && sortedLosers.length === 2) {
        const bronzeMatchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: 2,
          status: 'pending',
          knockout_bracket_slot: 2,
          series_target_wins: targetWins,
          is_knockout: true,
          knockout_match_stage: 'third_place',
        });
        await DatabaseService.setMatchPlayers(bronzeMatchId, [
          sortedLosers[0]!.loserId,
          sortedLosers[1]!.loserId,
        ]);
        await this.persistKnockoutMatchStarter(
          tournamentId,
          bronzeMatchId,
          [sortedLosers[0]!.loserId, sortedLosers[1]!.loserId],
          config
        );
      }
    } else {
      const playerCountEntering = winners.length;
      const { pairings, stage } = buildNextKnockoutPairings(winners, playerCountEntering);

      const roundId = await DatabaseService.createRound({
        tournament_id: tournamentId,
        round_number: roundNumber,
        status: 'pending',
        phase: 'knockout',
        knockout_stage: stage,
      });

      let matchNumber = 1;
      for (const p of pairings) {
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          knockout_bracket_slot: p.bracketSlot,
          series_target_wins: targetWins,
          is_knockout: true,
        });
        await DatabaseService.setMatchPlayers(matchId, [p.player1Id, p.player2Id]);
        await this.persistKnockoutMatchStarter(
          tournamentId,
          matchId,
          [p.player1Id, p.player2Id],
          config
        );
        matchNumber++;
      }
    }

    const { computeKnockoutFinalStandingsForTournament } = await import('./knockoutStandings');
    const standings = await computeKnockoutFinalStandingsForTournament(tournamentId);
    return { standings };
  }

  static async updateKnockoutConfig(
    tournamentId: number,
    updates: {
      knockout_size?: KnockoutSize;
      knockout_series?: KnockoutSeries;
      knockout_play_bronze_match?: boolean;
      knockout_match_starter?: 'random' | 'higher_swiss_seed';
      knockout_series_alternate_starter?: boolean;
    }
  ): Promise<void> {
    const tournament = await DatabaseService.getTournamentById(tournamentId);
    if (tournament?.knockout_phase_started_at) {
      throw new Error('knockout_already_started');
    }
    await DatabaseService.updateTournamentConfig(tournamentId, updates);
  }
}
