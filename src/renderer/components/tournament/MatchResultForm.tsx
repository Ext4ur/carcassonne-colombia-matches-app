import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '../../services/database';
import { Match } from '../../types/tournament';
import { Player } from '../../types/player';
import { calculatePositions } from '../../utils/scoring';
import Input from '../common/Input';

import Button from '../common/Button';

interface MatchResultFormProps {
  match: Match;
  tournamentId: number;
  playersPerMatch: number;
  onSave: () => void;
  onCancel: () => void;
  tournamentStatus?: 'draft' | 'in_progress' | 'completed';
}

export default function MatchResultForm({
  match,
  tournamentId,
  playersPerMatch,
  onSave,
  onCancel,
  tournamentStatus = 'in_progress',
}: MatchResultFormProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<Array<{ player_id: number; points: number }>>([]);
  const [firstPlayerId, setFirstPlayerId] = useState<number | undefined>(undefined);
  const [calculatedPositions, setCalculatedPositions] = useState<
    Array<{ player_id: number; position: number; points: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [matchPlayers, existingResults, matchData] = await Promise.all([
        DatabaseService.getMatchPlayers(match.id!) as Promise<Player[]>,
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
        // Initialize with match players if available, otherwise keep the initial empty structure
        if (matchPlayers.length > 0) {
          const initialResults = matchPlayers.slice(0, playersPerMatch).map((p) => ({
            player_id: p.id!,
            points: 0,
          }));
          setResults(initialResults);
          updatePositions(initialResults, undefined);
        }
      }
    } catch (error) {
      console.error('Error loading match data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [match.id, tournamentId, playersPerMatch]);

  useEffect(() => {
    if (match?.id) {
      // Initialize with empty results structure immediately
      // This allows inputs to render right away with valid values
      const initialResults = Array(playersPerMatch)
        .fill(null)
        .map(() => ({
          player_id: 0,
          points: 0,
        }));
      setResults(initialResults);
      setIsLoadingData(true);

      // Then load actual data
      loadData();
    }
  }, [match?.id, tournamentId, playersPerMatch, loadData]);

  const updatePositions = (
    resultsData: Array<{ player_id: number; points: number }>,
    firstPlayer?: number
  ) => {
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

    // Validate who started the match is selected (AC-012)
    if (firstPlayerId === undefined || firstPlayerId === null) {
      alert('Debes marcar quién empezó la partida para poder guardar los resultados.');
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
        first_player_id: firstPlayerId,
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
          <strong>Nota:</strong> Las posiciones se calculan automáticamente según los puntos. En
          caso de empate, el jugador que empezó la partida pierde.
        </p>
      </div>

      {results.map((result, index) => {
        const position = getPlayerPosition(result.player_id);
        const player = players.find((p) => p.id === result.player_id);
        return (
          <div
            key={result.player_id || `result-${index}`}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3 bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Jugador
                </label>
                <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {isLoadingData ? 'Cargando...' : player?.name || 'Sin asignar'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Puntos *
                </label>
                <Input
                  type="number"
                  value={
                    result && result.points !== undefined && result.points !== null
                      ? result.points === 0
                        ? ''
                        : String(result.points)
                      : ''
                  }
                  disabled={isLoadingData}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string for better UX while typing
                    if (value === '') {
                      updateResult(index, 'points', 0);
                    } else {
                      // Only allow digits
                      if (/^\d*$/.test(value)) {
                        const numValue = parseInt(value, 10);
                        if (!isNaN(numValue) && numValue >= 0) {
                          updateResult(index, 'points', numValue);
                        }
                      }
                    }
                  }}
                  onBlur={(e) => {
                    // Normalize value on blur - ensure it's a valid number
                    const value = e.target.value.trim();
                    if (value === '' || value === '0' || isNaN(parseInt(value, 10))) {
                      updateResult(index, 'points', 0);
                    }
                  }}
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
                    disabled={isLoadingData || tournamentStatus === 'completed'}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Empezó la partida <span className="text-red-500">*</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        );
      })}

      {tournamentStatus === 'completed' && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Nota:</strong> Este torneo está finalizado. Solo puedes ver los resultados, no
            puedes editarlos.
          </p>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          {tournamentStatus === 'completed' ? 'Cerrar' : 'Cancelar'}
        </Button>
        {tournamentStatus !== 'completed' && (
          <Button
            onClick={handleSave}
            isLoading={isLoading}
            disabled={firstPlayerId === undefined || firstPlayerId === null}
          >
            Guardar Resultados
          </Button>
        )}
      </div>
    </div>
  );
}
