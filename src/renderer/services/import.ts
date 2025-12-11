import { DatabaseService } from './database';
import { Player } from '../types/player';
import { Tournament, TournamentConfig } from '../types/tournament';
import { Circuit } from '../types/circuit';

interface ImportData {
  version: string;
  exportDate: string;
  data: {
    players: Player[];
    tournaments: any[];
    circuits: any[];
  };
}

export class ImportService {
  static async importAll(): Promise<{ success: boolean; error?: string; summary?: string }> {
    try {
      // Open file dialog
      const result = await window.electronAPI.openFile([
        { name: 'JSON Files', extensions: ['json'] },
      ]);

      if (!result.success || result.canceled || !result.data) {
        return { success: false, error: 'No se seleccionó ningún archivo' };
      }

      // Parse JSON
      let importData: ImportData;
      try {
        importData = JSON.parse(result.data);
      } catch (error) {
        return { success: false, error: 'El archivo no es un JSON válido' };
      }

      // Validate structure
      if (!importData.data || !importData.data.players || !importData.data.tournaments || !importData.data.circuits) {
        return { success: false, error: 'El archivo no tiene la estructura correcta' };
      }

      const summary: string[] = [];

      // Import players
      let playersImported = 0;
      for (const player of importData.data.players) {
        try {
          // Check if player exists
          const existing = await DatabaseService.getPlayerByBGAUsername(player.bga_username || '');
          if (!existing || existing.length === 0) {
            await DatabaseService.createPlayer({
              name: player.name,
              bga_username: player.bga_username,
              phone: player.phone,
              email: player.email,
              age: player.age,
            });
            playersImported++;
          }
        } catch (error) {
          console.error('Error importing player:', error);
        }
      }
      if (playersImported > 0) {
        summary.push(`${playersImported} jugador(es)`);
      }

      // Import circuits
      let circuitsImported = 0;
      for (const circuit of importData.data.circuits) {
        try {
          const existing = await DatabaseService.getCircuitByName(circuit.name);
          if (!existing) {
            await DatabaseService.createCircuit({
              name: circuit.name,
              description: circuit.description,
              start_date: circuit.start_date,
              end_date: circuit.end_date,
            });
            circuitsImported++;
          }
        } catch (error) {
          console.error('Error importing circuit:', error);
        }
      }
      if (circuitsImported > 0) {
        summary.push(`${circuitsImported} circuito(s)`);
      }

      // Import tournaments (simplified - just basic data)
      let tournamentsImported = 0;
      for (const tournament of importData.data.tournaments) {
        try {
          // Check if tournament exists by name and date
          const existing = await DatabaseService.getTournamentByNameAndDate(tournament.name, tournament.date);
          if (!existing || existing.length === 0) {
            const tournamentId = await DatabaseService.createTournament({
              name: tournament.name,
              type: tournament.type,
              circuit_id: tournament.circuit_id,
              date: tournament.date,
              players_per_match: tournament.players_per_match,
              number_of_rounds: tournament.number_of_rounds,
              status: tournament.status || 'draft',
            });

            // Import config if exists
            if (tournament.config) {
              await DatabaseService.createTournamentConfig({
                tournament_id: tournamentId,
                avoid_rematches: tournament.config.avoid_rematches,
                tiebreak_criteria: tournament.config.tiebreak_criteria,
                scoring_system: tournament.config.scoring_system,
                bye_selection: tournament.config.bye_selection,
              });
            }

            tournamentsImported++;
          }
        } catch (error) {
          console.error('Error importing tournament:', error);
        }
      }
      if (tournamentsImported > 0) {
        summary.push(`${tournamentsImported} torneo(s)`);
      }

      if (summary.length === 0) {
        return { success: true, summary: 'No se importaron datos nuevos (ya existían)' };
      }

      return { success: true, summary: summary.join(', ') };
    } catch (error) {
      console.error('Error importing:', error);
      return { success: false, error: String(error) };
    }
  }
}


