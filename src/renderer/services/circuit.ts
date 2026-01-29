import { DatabaseService } from './database';
import { SwissPairingService } from './swiss';
import { CircuitStandings } from '../types/circuit';

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
  /** Position (1-based) of each player at each circuit stop. For chart: evolución de posición. */
  static async getCircuitPositionEvolution(circuitId: number): Promise<CircuitPositionEvolution> {
    const tournaments = await DatabaseService.getCircuitTournaments(circuitId);
    const circuitStandings = await DatabaseService.getCircuitStandings(circuitId);
    if (tournaments.length === 0) {
      return { stops: [], players: circuitStandings.map((s) => ({ player_id: s.player_id, player_name: s.player_name, positions: [] })) };
    }

    const stops: string[] = [];
    const positionByPlayerByStop = new Map<number, (number | null)[]>();

    for (const standing of circuitStandings) {
      positionByPlayerByStop.set(standing.player_id, []);
    }

    for (const t of tournaments) {
      const config = await DatabaseService.getTournamentConfig(t.id);
      const tourStandings = await SwissPairingService.calculateStandings(
        t.id,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );
      const label = t.name.length > 20 ? t.name.slice(0, 17) + '…' : t.name;
      stops.push(label);

      for (const standing of circuitStandings) {
        const arr = positionByPlayerByStop.get(standing.player_id)!;
        const idx = tourStandings.findIndex((s) => s.player_id === standing.player_id);
        arr.push(idx === -1 ? null : idx + 1);
      }
    }

    const players = circuitStandings.map((s) => ({
      player_id: s.player_id,
      player_name: s.player_name,
      positions: positionByPlayerByStop.get(s.player_id) || [],
    }));

    return { stops, players };
  }

  /** Cumulative points after each stop. For chart: evolución de puntos acumulados. */
  static async getCircuitPointsEvolution(circuitId: number): Promise<CircuitPointsEvolution> {
    const tournaments = await DatabaseService.getCircuitTournaments(circuitId);
    const circuitStandings = await DatabaseService.getCircuitStandings(circuitId);
    if (tournaments.length === 0) {
      return { stops: [], players: circuitStandings.map((s) => ({ player_id: s.player_id, player_name: s.player_name, pointsCumulative: [] })) };
    }

    const stops: string[] = [];
    const pointsByPlayerByStop = new Map<number, number[]>();

    for (const standing of circuitStandings) {
      pointsByPlayerByStop.set(standing.player_id, []);
    }

    const cumulativeByPlayer = new Map<number, number>();
    for (const standing of circuitStandings) {
      cumulativeByPlayer.set(standing.player_id, 0);
    }

    for (const t of tournaments) {
      const config = await DatabaseService.getTournamentConfig(t.id);
      const tourStandings = await SwissPairingService.calculateStandings(
        t.id,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );
      const label = t.name.length > 20 ? t.name.slice(0, 17) + '…' : t.name;
      stops.push(label);

      for (const s of tourStandings) {
        const cum = cumulativeByPlayer.get(s.player_id) ?? 0;
        const newCum = cum + s.total_points;
        cumulativeByPlayer.set(s.player_id, newCum);
      }

      for (const standing of circuitStandings) {
        const arr = pointsByPlayerByStop.get(standing.player_id)!;
        arr.push(cumulativeByPlayer.get(standing.player_id) ?? 0);
      }
    }

    const players = circuitStandings.map((s) => ({
      player_id: s.player_id,
      player_name: s.player_name,
      pointsCumulative: pointsByPlayerByStop.get(s.player_id) || [],
    }));

    return { stops, players };
  }

  static async generateCircuitExcel(circuitId: number): Promise<any> {
    const circuit = await DatabaseService.getCircuitById(circuitId);
    const standings = await DatabaseService.getCircuitStandings(circuitId);

    const headers = ['Posición', 'Jugador', 'Puntos Totales', 'Torneos Jugados', 'Victorias'];
    const rows = standings.map((s, index) => [
      index + 1,
      s.player_name,
      s.total_points.toFixed(2),
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
    const standings = await DatabaseService.getCircuitStandings(circuitId);

    const headers = ['Posición', 'Jugador', 'Puntos Totales', 'Torneos Jugados', 'Victorias'];
    const rows = standings.map((s, index) => ({
      Posición: index + 1,
      Jugador: s.player_name,
      'Puntos Totales': s.total_points.toFixed(2),
      'Torneos Jugados': s.tournaments_played,
      Victorias: s.wins,
    }));

    return { headers, rows };
  }
}



