import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Match, MatchResult } from '../../types/tournament';
import {
  computeSeriesState,
  groupResultsByGame,
  resolveGameStarter,
} from '../../services/knockout';

interface SeriesMatchGroupProps {
  match: Match;
  players: Array<{ id?: number; name: string }>;
  results: MatchResult[];
  getPositionColor?: (position: number) => string;
}

export default function SeriesMatchGroup({
  match,
  players,
  results,
  getPositionColor,
}: SeriesMatchGroupProps) {
  const { t } = useTranslation();

  const playerIds = useMemo(
    () => players.map((p) => p.id!).filter(Boolean) as [number, number],
    [players]
  );

  const seriesState = useMemo(
    () => (playerIds.length === 2 ? computeSeriesState(match, results, playerIds) : null),
    [match, results, playerIds]
  );

  const gamesByNumber = useMemo(() => groupResultsByGame(results), [results]);
  const gameNumbers = useMemo(
    () => [...gamesByNumber.keys()].sort((a, b) => a - b),
    [gamesByNumber]
  );

  const activeGameNumber = useMemo(() => {
    if (!seriesState) return 1;
    if (seriesState.isComplete) {
      return seriesState.games[seriesState.games.length - 1]?.gameNumber ?? 1;
    }
    return seriesState.nextGameNumber;
  }, [seriesState]);

  const activeStarter = useMemo(
    () => resolveGameStarter(match, activeGameNumber),
    [match, activeGameNumber]
  );

  const winsLabel = (playerId: number) => seriesState?.winsByPlayer[playerId] ?? 0;

  const renderPlayerLine = (
    player: { id?: number; name: string },
    wins: number,
    isWinner: boolean,
    showStarter = false
  ) => (
    <span
      key={player.id}
      className={`flex items-center gap-1 ${isWinner ? 'font-bold text-green-700 dark:text-green-400' : 'font-medium'}`}
    >
      {player.name}
      <span className="text-xs text-gray-500 dark:text-gray-400">({wins})</span>
      {showStarter && activeStarter != null && Number(activeStarter) === Number(player.id) && (
        <span
          className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded"
          title={t('tournaments.detail.first_player_tooltip')}
        >
          🎲
        </span>
      )}
    </span>
  );

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/40 dark:bg-amber-900/10 p-3 space-y-2 min-w-[220px]">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {players.length >= 2 ? (
          <>
            {renderPlayerLine(
              players[0]!,
              winsLabel(players[0]!.id!),
              seriesState?.winnerId === players[0]!.id,
              match.status !== 'completed'
            )}
            <span className="text-gray-400 text-xs">{t('common.versus')}</span>
            {renderPlayerLine(
              players[1]!,
              winsLabel(players[1]!.id!),
              seriesState?.winnerId === players[1]!.id,
              match.status !== 'completed'
            )}
          </>
        ) : (
          players.map((p) => <span key={p.id}>{p.name}</span>)
        )}
        {match.status === 'completed' && seriesState?.isComplete && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
            {t('knockout.series.complete')}
          </span>
        )}
        {match.status === 'pending' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
            {t('knockout.series.in_progress')}
          </span>
        )}
      </div>

      {gameNumbers.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-800 dark:text-amber-200 font-medium select-none">
            {t('knockout.series.games_detail', { count: gameNumbers.length })}
          </summary>
          <div className="mt-2 space-y-2 pl-1 border-l-2 border-amber-200 dark:border-amber-700">
            {gameNumbers.map((gn) => {
              const gameResults = gamesByNumber.get(gn) ?? [];
              const starter = resolveGameStarter(match, gn);
              const sorted = [...gameResults].sort((a, b) => a.position - b.position);
              return (
                <div
                  key={gn}
                  className="pl-2 py-1 border-b border-amber-100 dark:border-amber-900/50 last:border-0"
                >
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    {t('knockout.match.game_n', { n: gn })}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {sorted.map((r) => {
                      const player = players.find((p) => p.id === r.player_id);
                      const color = getPositionColor?.(r.position) ?? '';
                      return (
                        <div key={r.player_id} className={`flex items-center gap-1 ${color}`}>
                          <span>{player?.name ?? r.player_id}</span>
                          <span className="text-xs opacity-80">({r.points})</span>
                          {starter != null && Number(starter) === Number(r.player_id) && (
                            <span
                              className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded"
                              title={t('tournaments.detail.first_player_tooltip')}
                            >
                              🎲
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
