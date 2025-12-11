import { useState, useEffect } from 'react';
import { DatabaseService } from '../../services/database';
import { Match, Player } from '../../types/tournament';
import { calculatePositions } from '../../utils/scoring';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';

interface MatchResultFormProps {
  match: Match;
  tournamentId: number;
  playersPerMatch: number;
  onSave: () => void;
  onCancel: () => void;
}

export default function MatchResultForm({
  match,
  tournamentId,
  playersPerMatch,
  onSave,
  onCancel,
}: MatchResultFormProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<Array<{ player_id: number; points: number }>>([]);
  const [firstPlayerId, setFirstPlayerId] = useState<number | undefined>(undefined);
  const [calculatedPositions, setCalculatedPositions] = useState<Array<{ player_id: number; position: number; points: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [match.id, tournamentId]);

  const loadData = async () => {
    try {
      const [matchPlayers, existingResults, matchData] = await Promise.all([
        DatabaseService.getMatchPlayers(match.id!),
        DatabaseService.getMatchResults(match.id!),
        DatabaseService.query('SELECT first_player_id FROM matches WHERE id = ?', [match.id!]),
      ]);

      // Use match players if available, otherwise fallback to tournament players
      if (matchPlayers.length > 0) {
        setPlayers(matchPlayers);
      } else {
        // Fallback: get all tournament players (for backwards compatibility)
        const tournamentPlayers = await DatabaseService.getTournamentPlayers(tournamentId);
        setPlayers(tournamentPlayers);
      }

      // Load first player
      if (matchData[0]?.first_player_id) {
        setFirstPlayerId(matchData[0].first_player_id);
      }

      if (existingResults.length > 0) {
        const loadedResults = existingResults.map((r) => ({
          player_id: r.player_id,
          points: r.points,
        }));
        setResults(loadedResults);
        // Calculate positions with first player info
        updatePositions(loadedResults, matchData[0]?.first_player_id);
      } else {
        // Initialize with match players
        const initialResults = matchPlayers.slice(0, playersPerMatch).map((p) => ({
          player_id: p.id!,
          points: 0,
        }));
        setResults(initialResults);
        updatePositions(initialResults, undefined);
      }
    } catch (error) {
      console.error('Error loading match data:', error);
    }
  };

  const updatePositions = (resultsData: Array<{ player_id: number; points: number }>, firstPlayer?: number) => {
    const positions = calculatePositions(resultsData, firstPlayer);
    setCalculatedPositions(positions);
  };

  const handleSave = async () => {
    // Validate all players are assigned
    if (results.some((r) => !r.player_id)) {
      alert('Todos los jugadores deben estar asignados');
      return;
    }

    // Validate all players have points entered
    if (results.some((r) => r.points === undefined || r.points === null)) {
      alert('Todos los jugadores deben tener puntos ingresados');
      return;
    }

    try {
      setIsLoading(true);
      const config = await DatabaseService.getTournamentConfig(tournamentId);
      const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };

      // Calculate positions automatically
      const positions = calculatePositions(results, firstPlayerId);

      // Delete existing results
      await DatabaseService.deleteMatchResults(match.id!);

      // Create new results with calculated positions
      for (const positioned of positions) {
        await DatabaseService.createMatchResult({
          match_id: match.id!,
          player_id: positioned.player_id,
          position: positioned.position,
          points: positioned.points,
          tournament_points: scoringSystem[positioned.position] || 0,
        });
      }

      // Update match status and first player
      await DatabaseService.updateMatch(match.id!, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        first_player_id: firstPlayerId || null,
      });

      onSave();
    } catch (error) {
      console.error('Error saving match results:', error);
      alert('Error al guardar los resultados');
    } finally {
      setIsLoading(false);
    }
  };

  const updateResult = (index: number, field: 'points', value: number) => {
    const newResults = [...results];
    newResults[index] = { ...newResults[index], [field]: value };
    setResults(newResults);
    // Recalculate positions when points change
    updatePositions(newResults, firstPlayerId);
  };

  const handleFirstPlayerChange = (playerId: number) => {
    const newFirstPlayerId = firstPlayerId === playerId ? undefined : playerId;
    setFirstPlayerId(newFirstPlayerId);
    // Recalculate positions immediately when first player changes
    updatePositions(results, newFirstPlayerId);
  };

  // Get position for a player
  const getPlayerPosition = (playerId: number): number => {
    const positioned = calculatedPositions.find((p) => p.player_id === playerId);
    return positioned?.position || 0;
  };

  return (
    <div className="space-y-4">
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Nota:</strong> Las posiciones se calculan automáticamente según los puntos. 
          En caso de empate, el jugador que empezó la partida pierde.
        </p>
      </div>

      {results.map((result, index) => {
        const position = getPlayerPosition(result.player_id);
        const player = players.find((p) => p.id === result.player_id);
        return (
          <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3 bg-gray-50 dark:bg-gray-700/50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Jugador
                </label>
                <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {player?.name || 'Sin asignar'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Puntos *
                </label>
                <Input
                  type="number"
                  value={result.points.toString()}
                  onChange={(e) => updateResult(index, 'points', Number(e.target.value))}
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Posición
                </label>
                <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-center font-semibold text-lg">
                  {position || '-'}
                </div>
              </div>
              <div className="flex items-end md:col-span-1">
                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={firstPlayerId === result.player_id}
                    onChange={() => handleFirstPlayerChange(result.player_id)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Empezó la partida
                  </span>
                </label>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave} isLoading={isLoading}>
          Guardar Resultados
        </Button>
      </div>
    </div>
  );
}

