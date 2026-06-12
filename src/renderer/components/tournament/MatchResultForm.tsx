import { useState, useEffect, useCallback, useRef } from 'react';
import { DatabaseService } from '../../services/database';
import { Match } from '../../types/tournament';
import { Player } from '../../types/player';
import { calculatePositions } from '../../utils/scoring';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatUserError } from '../../utils/formatUserError';
import Input from '../common/Input';
import Button from '../common/Button';
import {
  computeSeriesState,
  parseSeriesMeta,
  serializeSeriesMeta,
  resolveGameStarter,
  resolveKnockoutGameStarter,
  resultsForGame,
} from '../../services/knockout';
import type { KnockoutSeries } from '../../types/knockout';

interface MatchResultFormProps {
  match: Match;
  tournamentId: number;
  playersPerMatch: number;
  onSave: () => void;
  onCancel: () => void;
  tournamentStatus?: 'draft' | 'in_progress' | 'completed';
  roundStatus?: 'pending' | 'in_progress' | 'completed';
  isKnockout?: boolean;
  knockoutSeries?: KnockoutSeries;
}

export default function MatchResultForm({
  match,
  tournamentId,
  playersPerMatch,
  onSave,
  onCancel,
  tournamentStatus = 'in_progress',
  roundStatus,
  isKnockout = false,
  knockoutSeries = 'best_of_1',
}: MatchResultFormProps) {
  const effectivePlayersPerMatch = isKnockout ? 2 : playersPerMatch;
  const isBestOf3 = isKnockout && knockoutSeries === 'best_of_3';
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<Array<{ player_id: number; points: number }>>([]);
  const [firstPlayerId, setFirstPlayerId] = useState<number | undefined>(undefined);
  const [calculatedPositions, setCalculatedPositions] = useState<
    Array<{ player_id: number; position: number; points: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [activeGameNumber, setActiveGameNumber] = useState(1);
  const [seriesWins, setSeriesWins] = useState<Record<number, number>>({});
  const firstPointsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoadingData || tournamentStatus === 'completed' || roundStatus === 'completed') return;
    const id = requestAnimationFrame(() => {
      firstPointsInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isLoadingData, match.id, tournamentStatus, roundStatus]);

  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [matchPlayers, existingResults, matchData, tournamentConfig, knockoutSeeds] =
        await Promise.all([
          DatabaseService.getMatchPlayers(match.id!) as Promise<Player[]>,
          DatabaseService.getMatchResults(match.id!),
          DatabaseService.query<{
            first_player_id: number | null;
            series_target_wins: number | null;
            series_meta: string | null;
            series_winner_id: number | null;
          }>(
            'SELECT first_player_id, series_target_wins, series_meta, series_winner_id FROM matches WHERE id = ?',
            [match.id!]
          ),
          isKnockout ? DatabaseService.getTournamentConfig(tournamentId) : Promise.resolve(null),
          isKnockout ? DatabaseService.getKnockoutSeeds(tournamentId) : Promise.resolve([]),
        ]);

      const seedByPlayer = new Map(
        (knockoutSeeds ?? []).map((s) => [s.player_id, s.seed] as const)
      );

      const suggestStarter = (
        gameNumber: number,
        pids: [number, number],
        meta: ReturnType<typeof parseSeriesMeta>,
        mRow: (typeof matchData)[0] | undefined,
        results: typeof existingResults
      ): number | undefined => {
        if (!isKnockout || pids.length !== 2) return undefined;
        const seriesState = computeSeriesState(
          {
            ...match,
            series_target_wins: mRow?.series_target_wins ?? (isBestOf3 ? 2 : 1),
            series_meta: mRow?.series_meta ?? undefined,
            first_player_id: mRow?.first_player_id ?? undefined,
          },
          results,
          pids
        );
        return resolveKnockoutGameStarter(gameNumber, pids, {
          matchStarter: tournamentConfig?.knockout_match_starter ?? 'higher_swiss_seed',
          seriesStarterMode: tournamentConfig?.knockout_series_starter_mode,
          alternateStarter: Boolean(tournamentConfig?.knockout_series_alternate_starter),
          seedByPlayer,
          seriesState,
          existingStarters: meta.gameStarters,
        });
      };

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

      if (existingResults.length > 0 && isBestOf3) {
        const pids = matchPlayers.map((p) => p.id!) as [number, number];
        const mRow = matchData[0];
        const seriesState = computeSeriesState(
          {
            ...match,
            series_target_wins: mRow?.series_target_wins ?? 2,
            series_meta: mRow?.series_meta ?? undefined,
            first_player_id: mRow?.first_player_id ?? undefined,
          },
          existingResults,
          pids
        );
        setSeriesWins(seriesState.winsByPlayer);
        const gn = seriesState.isComplete
          ? (seriesState.games[seriesState.games.length - 1]?.gameNumber ?? 1)
          : seriesState.nextGameNumber;
        setActiveGameNumber(gn);
        const gameResults = existingResults.filter((r) => (r.game_number ?? 1) === gn);
        if (gameResults.length >= 2) {
          const loadedResults = gameResults.map((r) => ({
            player_id: r.player_id,
            points: r.points,
          }));
          setResults(loadedResults);
          const meta = parseSeriesMeta(mRow?.series_meta ?? undefined);
          updatePositions(
            loadedResults,
            meta.gameStarters[gn] ?? mRow?.first_player_id ?? undefined
          );
          setFirstPlayerId(meta.gameStarters[gn] ?? mRow?.first_player_id ?? undefined);
        } else {
          const initialResults = matchPlayers.slice(0, 2).map((p) => ({
            player_id: p.id!,
            points: 0,
          }));
          const meta = parseSeriesMeta(mRow?.series_meta ?? undefined);
          const starter = suggestStarter(gn, pids, meta, mRow, existingResults);
          setResults(initialResults);
          updatePositions(initialResults, starter);
          setFirstPlayerId(starter);
        }
      } else if (existingResults.length > 0) {
        const gameResults = resultsForGame(existingResults, 1);
        const loadedResults = gameResults.map((r) => ({
          player_id: r.player_id,
          points: r.points,
        }));
        setResults(loadedResults);
        const mRow = matchData[0];
        const starter = resolveGameStarter(
          {
            ...match,
            series_meta: mRow?.series_meta ?? undefined,
            first_player_id: mRow?.first_player_id ?? undefined,
          },
          1
        );
        updatePositions(loadedResults, starter);
        if (starter != null) setFirstPlayerId(starter);
      } else {
        // Initialize with match players if available, otherwise keep the initial empty structure
        if (matchPlayers.length > 0) {
          const initialResults = matchPlayers.slice(0, effectivePlayersPerMatch).map((p) => ({
            player_id: p.id!,
            points: 0,
          }));
          const pids = matchPlayers.slice(0, 2).map((p) => p.id!) as [number, number];
          const meta = parseSeriesMeta(matchData[0]?.series_meta ?? undefined);
          const suggested = suggestStarter(1, pids, meta, matchData[0], existingResults);
          const starter =
            suggested ??
            resolveGameStarter(
              {
                ...match,
                series_meta: matchData[0]?.series_meta ?? undefined,
                first_player_id: matchData[0]?.first_player_id ?? undefined,
              },
              1
            );
          setResults(initialResults);
          updatePositions(initialResults, starter);
          if (starter != null) setFirstPlayerId(starter);
        }
      }
    } catch (error) {
      console.error('Error loading match data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [match, tournamentId, effectivePlayersPerMatch, isBestOf3, isKnockout]);

  useEffect(() => {
    if (match?.id) {
      // Initialize with empty results structure immediately
      // This allows inputs to render right away with valid values
      const initialResults = Array(effectivePlayersPerMatch)
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
  }, [match?.id, tournamentId, effectivePlayersPerMatch, loadData]);

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
      addNotification({
        message: t('tournaments.match.error_all_assigned'),
        type: 'warning',
      });
      return;
    }

    // Validate all players have points entered
    if (results.some((r) => r.points === undefined || r.points === null)) {
      addNotification({
        message: t('tournaments.match.error_all_points'),
        type: 'warning',
      });
      return;
    }

    // Validate who started the match is selected (AC-012)
    if (firstPlayerId === undefined || firstPlayerId === null) {
      addNotification({
        message: t('tournaments.match.error_starter_required'),
        type: 'warning',
      });
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

      const positions = calculatePositions(results, firstPlayerId);

      if (isBestOf3) {
        const matchRows = await DatabaseService.query<{
          series_target_wins: number | null;
          series_meta: string | null;
        }>('SELECT series_target_wins, series_meta FROM matches WHERE id = ?', [match.id!]);
        const meta = parseSeriesMeta(matchRows[0]?.series_meta ?? undefined);
        meta.gameStarters[activeGameNumber] = firstPlayerId!;
        await DatabaseService.deleteMatchResultsForGame(match.id!, activeGameNumber);
        for (const positioned of positions) {
          await DatabaseService.createMatchResult({
            match_id: match.id!,
            player_id: positioned.player_id,
            position: positioned.position,
            points: positioned.points,
            tournament_points: 0,
            game_number: activeGameNumber,
          });
        }
        const playerIds = results.map((r) => r.player_id) as [number, number];
        const allResults = await DatabaseService.getMatchResults(match.id!);
        const seriesState = computeSeriesState(
          {
            ...match,
            series_target_wins: matchRows[0]?.series_target_wins ?? 2,
            series_meta: serializeSeriesMeta(meta),
            first_player_id: firstPlayerId,
          },
          allResults,
          playerIds
        );
        await DatabaseService.updateMatch(match.id!, {
          series_meta: serializeSeriesMeta(meta),
          first_player_id: firstPlayerId,
          ...(seriesState.isComplete
            ? {
                status: 'completed' as const,
                completed_at: new Date().toISOString(),
                series_winner_id: seriesState.winnerId,
              }
            : { status: 'pending' as const, series_winner_id: null }),
        });
      } else {
        await DatabaseService.deleteMatchResults(match.id!);

        for (const positioned of positions) {
          await DatabaseService.createMatchResult({
            match_id: match.id!,
            player_id: positioned.player_id,
            position: positioned.position,
            points: positioned.points,
            tournament_points: scoringSystem[positioned.position] || 0,
            game_number: 1,
          });
        }

        const meta = parseSeriesMeta(match.series_meta ?? undefined);
        meta.gameStarters[1] = firstPlayerId!;
        await DatabaseService.updateMatch(match.id!, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          first_player_id: firstPlayerId,
          series_meta: serializeSeriesMeta(meta),
          series_winner_id: positions.find((p) => p.position === 1)?.player_id ?? null,
        });
      }

      onSave();
    } catch (error) {
      console.error('Error saving match results:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.match.save_error')),
        type: 'error',
      });
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
      {isBestOf3 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <p className="font-medium">{t('knockout.match.game_n', { n: activeGameNumber })}</p>
          {Object.keys(seriesWins).length > 0 && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {players.map((p) => `${p.name}: ${seriesWins[p.id!] ?? 0}`).join(' • ')}
            </p>
          )}
        </div>
      )}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>{t('common.note')}:</strong> {t('tournaments.match.note_positions')}
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
                    ? t('tournaments.match.loading')
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
                  {t('tournaments.match.points_label')}
                </label>
                <div className="relative">
                  <Input
                    ref={index === 0 ? firstPointsInputRef : undefined}
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
                    {t('tournaments.match.pts')}
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
            <strong>⚠️ {t('common.warning')}:</strong>{' '}
            {t('tournaments.match.edit_completed_round_warning')}
          </p>
        </div>
      )}

      {tournamentStatus === 'completed' && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>{t('common.note')}:</strong> {t('tournaments.match.note_completed')}
          </p>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          {tournamentStatus === 'completed'
            ? t('tournaments.match.close')
            : t('tournaments.preview.cancel')}
        </Button>
        {tournamentStatus !== 'completed' && (
          <Button
            onClick={handleSave}
            isLoading={isLoading}
            disabled={firstPlayerId === undefined || firstPlayerId === null}
          >
            {t('tournaments.match.save_btn')}
          </Button>
        )}
      </div>
    </div>
  );
}
