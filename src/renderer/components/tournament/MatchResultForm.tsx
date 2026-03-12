import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '../../services/database';
import { Match } from '../../types/tournament';
import { Player } from '../../types/player';
import { calculatePositions } from '../../utils/scoring';
import { useTranslation } from 'react-i18next';
import Input from '../common/Input';

import Button from '../common/Button';

interface MatchResultFormProps {
  match: Match;
  tournamentId: number;
  playersPerMatch: number;
  onSave: () => void;
  onCancel: () => void;
  tournamentStatus?: 'draft' | 'in_progress' | 'completed';
  roundStatus?: 'pending' | 'in_progress' | 'completed';
}

export default function MatchResultForm({
  match,
  tournamentId,
  playersPerMatch,
  onSave,
  onCancel,
  tournamentStatus = 'in_progress',
  roundStatus,
}: MatchResultFormProps) {
  const { t } = useTranslation();
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
        DatabaseService.query<{ first_player_id: number | null }>(
          'SELECT first_player_id FROM matches WHERE id = ?',
          [match.id!]
        ),
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
        updatePositions(loadedResults, matchData[0]?.first_player_id ?? undefined);
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
      alert(t('tournaments.match.error_all_assigned'));
      return;
    }

    // Validate all players have points entered
    if (results.some((r) => r.points === undefined || r.points === null)) {
      alert(t('tournaments.match.error_all_points'));
      return;
    }

    // Validate who started the match is selected (AC-012)
    if (firstPlayerId === undefined || firstPlayerId === null) {
      alert(t('tournaments.match.error_starter_required'));
      return;
    }

    try {
      setIsLoading(true);

      // Warn before overwriting a completed round
      if (roundStatus === 'completed') {
        const confirmed = window.confirm(t('tournaments.match.edit_completed_round_confirm'));
        if (!confirmed) {
          setIsLoading(false);
          return;
        }
      }

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
      alert(t('tournaments.match.save_error', 'Error al guardar los resultados'));
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
          <strong>{t('common.note', 'Nota')}:</strong> {t('tournaments.match.note_positions')}
        </p>
      </div>

      {results.map((result, index) => {
        const position = getPlayerPosition(result.player_id);
        const player = players.find((p) => p.id === result.player_id);
        const isFirst = firstPlayerId === result.player_id;

        return (
          <div
            key={result.player_id || `result-${index}`}
            className={`p-4 border rounded-lg mb-3 transition-colors ${
              isFirst
                ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'
                : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Player Name & Start Button */}
              <div className="flex-1 min-w-[200px] flex items-center justify-between gap-2">
                <span className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
                  {isLoadingData
                    ? t('tournaments.match.loading', 'Cargando...')
                    : player?.name || t('tournaments.detail.unassigned')}
                </span>

                <button
                  type="button"
                  onClick={() => handleFirstPlayerChange(result.player_id)}
                  disabled={isLoadingData || tournamentStatus === 'completed'}
                  className={`
                    flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all
                    ${
                      isFirst
                        ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-500 ring-offset-1 dark:bg-blue-900/50 dark:text-blue-100 dark:ring-offset-gray-900'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  {isFirst ? (
                    <>
                      <span>{t('tournaments.match.first_player_btn')}</span>
                      <span className="text-base">🎲</span>
                    </>
                  ) : (
                    <span>{t('tournaments.match.mark_first_btn')}</span>
                  )}
                </button>
              </div>

              {/* Points */}
              <div className="w-full md:w-32">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 md:hidden">
                  {t('tournaments.match.points_label', 'Puntos')}
                </label>
                <div className="relative">
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
                    className="text-center font-mono font-bold text-lg"
                    placeholder="0"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        updateResult(index, 'points', 0);
                      } else if (/^\d*$/.test(value)) {
                        const numValue = parseInt(value, 10);
                        if (!isNaN(numValue) && numValue >= 0) {
                          updateResult(index, 'points', numValue);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value === '' || value === '0' || isNaN(parseInt(value, 10))) {
                        updateResult(index, 'points', 0);
                      }
                    }}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                    {t('tournaments.match.pts', 'PTS')}
                  </span>
                </div>
              </div>

              {/* Position Indicators */}
              <div className="flex items-center justify-center md:justify-end min-w-[60px]">
                {(() => {
                  const pos = position;
                  if (!pos) return <span className="text-gray-400 text-2xl">-</span>;

                  let content = '';
                  let colorClass = '';

                  if (pos === 1) {
                    content = '🥇';
                    colorClass = 'drop-shadow-md scale-125';
                  } else if (pos === 2) {
                    content = '🥈';
                    colorClass = 'drop-shadow-md scale-125';
                  } else if (pos === 3) {
                    content = '🥉';
                    colorClass = 'drop-shadow-md scale-125';
                  } else {
                    content = `${pos}º`; // ordinal number
                    colorClass = 'text-2xl font-bold text-gray-600 dark:text-gray-400';
                  }

                  return (
                    <div
                      className={`transition-all duration-300 ${colorClass}`}
                      title={t('tournaments.match.position_title', { pos })}
                    >
                      {content}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })}

      {roundStatus === 'completed' && tournamentStatus !== 'completed' && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-300 dark:border-amber-700">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>⚠️ {t('common.warning', 'Atención')}:</strong>{' '}
            {t('tournaments.match.edit_completed_round_warning')}
          </p>
        </div>
      )}

      {tournamentStatus === 'completed' && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>{t('common.note', 'Nota')}:</strong> {t('tournaments.match.note_completed')}
          </p>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          {tournamentStatus === 'completed'
            ? t('tournaments.match.close', 'Cerrar')
            : t('tournaments.preview.cancel', 'Cancelar')}
        </Button>
        {tournamentStatus !== 'completed' && (
          <Button
            onClick={handleSave}
            isLoading={isLoading}
            disabled={firstPlayerId === undefined || firstPlayerId === null}
          >
            {t('tournaments.match.save_btn', 'Guardar Resultados')}
          </Button>
        )}
      </div>
    </div>
  );
}
