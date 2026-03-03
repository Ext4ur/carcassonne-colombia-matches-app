/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseService } from './database';
import { SwissPairingService } from './swiss';
import { CircuitStandings } from '../types/circuit';

import { getCircuitPointsByRank } from '../utils/circuitScoring';

/** Data for "posición por parada" chart: evolution of each player's position at each stop. */
export interface CircuitPositionEvolution {
  stops: string[];
  players: Array<{
    player_id: number;
    player_name: string;
    positions: (number | null)[];
  }>;
}

/** Data for "puntos acumulados por parada" chart: cumulative points after each stop. */
export interface CircuitPointsEvolution {
  stops: string[];
  players: Array<{
    player_id: number;
    player_name: string;
    pointsCumulative: number[];
  }>;
}

export class CircuitService {
  /**
   * Calcula la clasificación general del circuito basada en:
   * 1. Sumatoria de puntos de circuito (basado en ranking de cada parada)
   * 2. Victorias totales en partidas
   * 3. Victorias de los oponentes (SOS)
   * 4. Enfrentamiento directo
   */
  static async getCircuitStandings(
    circuitId: number,
    tournamentIds?: number[]
  ): Promise<CircuitStandings[]> {
    const tournaments = await DatabaseService.getCircuitTournaments(circuitId);
    let completedTournaments = tournaments.filter((t) => t.status === 'completed');

    if (tournamentIds && tournamentIds.length > 0) {
      completedTournaments = completedTournaments.filter((t) => tournamentIds.includes(t.id));
    }

    if (completedTournaments.length === 0) {
      // Si no hay torneos completados, devolvemos lista vacía (o podríamos devolver inscritos con 0)
      return [];
    }

    const playerStats = new Map<
      number,
      {
        player_id: number;
        player_name: string;
        total_points: number;
        wins: number;
        tournaments_played: number;
        opponentsFacing: number[]; // List of opponent IDs faced (with duplicates if faced multiple times)
      }
    >();

    const h2hMatches = new Map<string, number>(); // "minId,maxId" -> score for minId (positive) or maxId (negative)

    for (const t of completedTournaments) {
      const config = await DatabaseService.getTournamentConfig(t.id);
      const tourStandings = await SwissPairingService.calculateStandings(
        t.id,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );

      const totalPlayers = tourStandings.length;

      // 1. Asignar puntos de circuito por ranking
      tourStandings.forEach((s, index) => {
        const rank = index + 1;
        const circuitPts = getCircuitPointsByRank(rank, totalPlayers);

        if (!playerStats.has(s.player_id)) {
          playerStats.set(s.player_id, {
            player_id: s.player_id,
            player_name: s.player_name,
            total_points: 0,
            wins: 0,
            tournaments_played: 0,
            opponentsFacing: [],
          });
        }

        const stats = playerStats.get(s.player_id)!;
        stats.total_points += circuitPts;
        stats.wins += s.wins;
        stats.tournaments_played += 1;
      });

      // 2. Rastrear oponentes y enfrentamientos directos para desempates
      const rounds = await DatabaseService.getTournamentRounds(t.id);
      for (const r of rounds) {
        if (r.status !== 'completed') continue;
        const matches = await DatabaseService.getRoundMatches(r.id!);
        for (const m of matches) {
          if (m.status !== 'completed') continue;
          const matchWithRes = await DatabaseService.getMatchWithResults(m.id!);
          const results = matchWithRes.results || [];
          if (results.length < 2) continue;

          // Solo para 2 jugadores (Carcassonne estándar)
          const p1 = results[0];
          const p2 = results[1];

          // Track opponents
          playerStats.get(p1.player_id)?.opponentsFacing.push(p2.player_id);
          playerStats.get(p2.player_id)?.opponentsFacing.push(p1.player_id);

          // Track H2H
          const ids = [p1.player_id, p2.player_id].sort((a, b) => a - b);
          const key = `${ids[0]},${ids[1]}`;
          const currentScore = h2hMatches.get(key) || 0;

          if (p1.position === 1 && p2.position !== 1) {
            h2hMatches.set(key, currentScore + (p1.player_id === ids[0] ? 1 : -1));
          } else if (p2.position === 1 && p1.position !== 1) {
            h2hMatches.set(key, currentScore + (p2.player_id === ids[0] ? 1 : -1));
          }
        }
      }
    }

    // 3. Calcular SOS (Suma de victorias de oponentes en el circuito)
    const standingsRaw: CircuitStandings[] = Array.from(playerStats.values()).map((stats) => {
      const sos = stats.opponentsFacing.reduce((sum, oppId) => {
        return sum + (playerStats.get(oppId)?.wins || 0);
      }, 0);

      return {
        player_id: stats.player_id,
        player_name: stats.player_name,
        total_points: stats.total_points,
        wins: stats.wins,
        tournaments_played: stats.tournaments_played,
        sos,
      };
    });

    // 4. Ordenar por criterios
    standingsRaw.sort((a, b) => {
      // 1. Puntos Totales
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      // 2. Victorias
      if (b.wins !== a.wins) return b.wins - a.wins;
      // 3. SOS
      if (b.sos !== a.sos) return b.sos - a.sos;
      // 4. Enfrentamiento directo
      const ids = [a.player_id, b.player_id].sort((m, n) => m - n);
      const key = `${ids[0]},${ids[1]}`;
      const score = h2hMatches.get(key) || 0;
      if (score !== 0) {
        // Si score > 0, ids[0] ganó más. Si score < 0, ids[1] ganó más.
        const winnerId = score > 0 ? ids[0] : ids[1];
        return winnerId === a.player_id ? -1 : 1;
      }
      return 0;
    });

    return standingsRaw;
  }

  /** Position (1-based) of each player at each circuit stop. For chart: evolución de posición. */
  static async getCircuitPositionEvolution(circuitId: number): Promise<CircuitPositionEvolution> {
    const tournaments = await DatabaseService.getCircuitTournaments(circuitId);
    if (tournaments.length === 0) return { stops: [], players: [] };

    const stops: string[] = [];
    const positionByPlayerByStop = new Map<number, (number | null)[]>();
    const playerNames = new Map<number, string>();

    // Usamos todos los jugadores que han participado en el circuito
    const allStandings = await this.getCircuitStandings(circuitId);
    for (const s of allStandings) {
      positionByPlayerByStop.set(s.player_id, []);
      playerNames.set(s.player_id, s.player_name);
    }

    for (const t of tournaments) {
      if (t.status !== 'completed') continue;

      const config = await DatabaseService.getTournamentConfig(t.id);
      const tourStandings = await SwissPairingService.calculateStandings(
        t.id,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );

      const label = t.name.length > 20 ? t.name.slice(0, 17) + '…' : t.name;
      stops.push(label);

      for (const [pid, arr] of positionByPlayerByStop.entries()) {
        const idx = tourStandings.findIndex((s) => s.player_id === pid);
        arr.push(idx === -1 ? null : idx + 1);
      }
    }

    const players = Array.from(positionByPlayerByStop.entries()).map(([pid, positions]) => ({
      player_id: pid,
      player_name: playerNames.get(pid) || `Player ${pid}`,
      positions,
    }));

    return { stops, players };
  }

  /** Cumulative points after each stop. For chart: evolución de puntos acumulados. */
  static async getCircuitPointsEvolution(circuitId: number): Promise<CircuitPointsEvolution> {
    const tournaments = await DatabaseService.getCircuitTournaments(circuitId);
    if (tournaments.length === 0) return { stops: [], players: [] };

    const stops: string[] = [];
    const pointsByPlayerByStop = new Map<number, number[]>();
    const playerNames = new Map<number, string>();
    const cumulativeByPlayer = new Map<number, number>();

    const allStandings = await this.getCircuitStandings(circuitId);
    for (const s of allStandings) {
      pointsByPlayerByStop.set(s.player_id, []);
      playerNames.set(s.player_id, s.player_name);
      cumulativeByPlayer.set(s.player_id, 0);
    }

    for (const t of tournaments) {
      if (t.status !== 'completed') continue;

      const config = await DatabaseService.getTournamentConfig(t.id);
      const tourStandings = await SwissPairingService.calculateStandings(
        t.id,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );

      const label = t.name.length > 20 ? t.name.slice(0, 17) + '…' : t.name;
      stops.push(label);

      const totalPlayers = tourStandings.length;

      // Calcular puntos de circuito para esta parada
      const currentStopPoints = new Map<number, number>();
      tourStandings.forEach((s, index) => {
        const rank = index + 1;
        currentStopPoints.set(s.player_id, getCircuitPointsByRank(rank, totalPlayers));
      });

      for (const [pid, arr] of pointsByPlayerByStop.entries()) {
        const pts = currentStopPoints.get(pid) || 0;
        const newCum = (cumulativeByPlayer.get(pid) || 0) + pts;
        cumulativeByPlayer.set(pid, newCum);
        arr.push(newCum);
      }
    }

    const players = Array.from(pointsByPlayerByStop.entries()).map(([pid, pointsCumulative]) => ({
      player_id: pid,
      player_name: playerNames.get(pid) || `Player ${pid}`,
      pointsCumulative,
    }));

    return { stops, players };
  }

  static async generateCircuitExcel(circuitId: number): Promise<any> {
    // const circuit = await DatabaseService.getCircuitById(circuitId);
    const standings = (await DatabaseService.getCircuitStandings(circuitId)) as CircuitStandings[];

    const headers = ['Posición', 'Jugador', 'Puntos Totales', 'Torneos Jugados', 'Victorias'];
    const rows = standings.map((s, index) => [
      index + 1,
      s.player_name,
      s.total_points.toFixed(0),
      s.tournaments_played,
      s.wins,
    ]);

    return {
      sheets: [
        {
          name: 'Acumulado Circuito',
          headers,
          rows,
        },
      ],
    };
  }

  static async generateCircuitCSV(circuitId: number): Promise<any> {
    const standings = (await DatabaseService.getCircuitStandings(circuitId)) as CircuitStandings[];

    const headers = ['Posición', 'Jugador', 'Puntos Totales', 'Torneos Jugados', 'Victorias'];
    const rows = standings.map((s, index) => ({
      Posición: index + 1,
      Jugador: s.player_name,
      'Puntos Totales': s.total_points.toFixed(0),
      'Torneos Jugados': s.tournaments_played,
      Victorias: s.wins,
    }));

    return { headers, rows };
  }
}
