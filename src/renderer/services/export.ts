import { DatabaseService } from './database';

export class ExportService {
  static async exportAll(): Promise<void> {
    // Get all data
    const players = await DatabaseService.getAllPlayers();
    const tournaments = await DatabaseService.getAllTournaments();
    const circuits = await DatabaseService.getAllCircuits();

    // Get tournament configs and players
    const tournamentsWithData = await Promise.all(
      tournaments.map(async (tournament) => {
        const config = await DatabaseService.getTournamentConfig(tournament.id!);
        const tournamentPlayers = await DatabaseService.getTournamentPlayers(tournament.id!);
        const rounds = await DatabaseService.getTournamentRounds(tournament.id!);
        
        const roundsWithData = await Promise.all(
          rounds.map(async (round) => {
            const matches = await DatabaseService.getRoundMatches(round.id!);
            const matchesWithData = await Promise.all(
              matches.map(async (match) => {
                const results = await DatabaseService.getMatchResults(match.id!);
                const matchPlayers = await DatabaseService.getMatchPlayers(match.id!);
                return {
                  ...match,
                  results,
                  players: matchPlayers,
                };
              })
            );
            return {
              ...round,
              matches: matchesWithData,
            };
          })
        );

        return {
          ...tournament,
          config,
          players: tournamentPlayers,
          rounds: roundsWithData,
        };
      })
    );

    // Get circuit tournaments
    const circuitsWithData = await Promise.all(
      circuits.map(async (circuit) => {
        const circuitTournaments = tournaments.filter((t) => t.circuit_id === circuit.id);
        return {
          ...circuit,
          tournaments: circuitTournaments.map((t) => t.id),
        };
      })
    );

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        players,
        tournaments: tournamentsWithData,
        circuits: circuitsWithData,
      },
    };

    // Save to file
    const data = JSON.stringify(exportData, null, 2);
    const filename = `carcassonne_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    await window.electronAPI.saveFile(data, filename, 'json');
  }
}


