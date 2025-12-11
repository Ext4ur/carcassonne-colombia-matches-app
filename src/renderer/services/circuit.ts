import { DatabaseService } from './database';
import { CircuitStandings } from '../types/circuit';

export class CircuitService {
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



