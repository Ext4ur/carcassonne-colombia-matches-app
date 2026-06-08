import { useState, useEffect, type ReactNode } from 'react';
import { DatabaseService } from '../../services/database';
import {
  PlayerStanding,
  MatchResultWithPlayer,
  Match,
  BuchholzByeMode,
} from '../../types/tournament';
import { TiebreakService, TiebreakData, TiebreakCalculateOptions } from '../../services/tiebreak';
import { getBuchholzModeMeta } from '../../utils/buchholzModeMeta';
import { useTranslation } from 'react-i18next';

interface TournamentMatrixProps {
  tournamentId: number;
  standings: PlayerStanding[];
}

interface MatrixData {
  [playerId: number]: {
    [opponentId: number]: number; // Times faced
  };
}

export default function TournamentMatrix({ tournamentId, standings }: TournamentMatrixProps) {
  const { t } = useTranslation();
  const [matrixData, setMatrixData] = useState<MatrixData>({});
  const [byeRoundsByPlayer, setByeRoundsByPlayer] = useState<Record<number, number[]>>({});
  const [matrixTiebreakData, setMatrixTiebreakData] = useState<TiebreakData | null>(null);
  const [buchholzOpts, setBuchholzOpts] = useState<TiebreakCalculateOptions | null>(null);
  const [buchholzMode, setBuchholzMode] = useState<BuchholzByeMode>('legacy');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatrixData = async () => {
      setLoading(true);
      try {
        const [roundsRaw, config, tournament] = await Promise.all([
          DatabaseService.getTournamentRounds(tournamentId),
          DatabaseService.getTournamentConfig(tournamentId),
          DatabaseService.getTournamentById(tournamentId),
        ]);

        const roundsSorted = [...roundsRaw].sort((a, b) => a.round_number - b.round_number);
        const roundMatchesByRound: Match[][] = [];
        const resultsByMatch: Record<number, MatchResultWithPlayer[]> = {};
        const data: MatrixData = {};

        for (const round of roundsSorted) {
          const matches = await DatabaseService.getRoundMatches(round.id!);
          roundMatchesByRound.push(matches);
          for (const match of matches) {
            const results = (await DatabaseService.getMatchResults(
              match.id!,
              tournamentId
            )) as MatchResultWithPlayer[];
            resultsByMatch[match.id!] = results;

            results.forEach((res1) => {
              if (!data[res1.player_id]) data[res1.player_id] = {};
              results.forEach((res2) => {
                if (res1.player_id !== res2.player_id) {
                  data[res1.player_id][res2.player_id] =
                    (data[res1.player_id][res2.player_id] || 0) + 1;
                }
              });
            });
          }
        }

        const playerTotalPoints: Record<number, number> = {};
        standings.forEach((s) => {
          playerTotalPoints[s.player_id] = s.total_points;
        });

        const tiebreakData: TiebreakData = {
          rounds: roundsSorted,
          roundMatches: roundMatchesByRound,
          resultsByMatch,
          playerTotalPoints,
        };

        const mode = (config?.buchholz_bye_mode ?? 'legacy') as BuchholzByeMode;
        setBuchholzMode(mode);
        const scheduledN = tournament?.number_of_rounds ?? 0;
        const maxRoundNo =
          roundsSorted.length > 0 ? Math.max(...roundsSorted.map((r) => r.round_number)) : 0;
        const numberOfRounds = Math.max(1, scheduledN, maxRoundNo, roundsSorted.length);
        const avg =
          standings.length > 0
            ? standings.reduce((s, x) => s + x.total_points, 0) / standings.length
            : 0;

        const bOpts: TiebreakCalculateOptions = {
          buchholzByeMode: mode,
          numberOfRounds,
          tournamentPointsAverage: avg,
        };

        const byeKeys = TiebreakService.byePlayerRoundKeys(
          roundsSorted,
          roundMatchesByRound,
          resultsByMatch
        );
        const byeByPlayer: Record<number, number[]> = {};
        byeKeys.forEach((key) => {
          const [pidStr, rnStr] = key.split(':');
          const pid = Number(pidStr);
          const rn = Number(rnStr);
          if (!byeByPlayer[pid]) byeByPlayer[pid] = [];
          byeByPlayer[pid].push(rn);
        });
        Object.keys(byeByPlayer).forEach((k) => {
          byeByPlayer[Number(k)]!.sort((a, b) => a - b);
        });

        setByeRoundsByPlayer(byeByPlayer);
        setMatrixTiebreakData(tiebreakData);
        setBuchholzOpts(bOpts);
        setMatrixData(data);
      } catch (error) {
        console.error('Error fetching matrix data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatrixData();
  }, [tournamentId, standings]);

  if (loading) return <div className="p-4">{t('common.loading')}</div>;
  const modeMeta = getBuchholzModeMeta(buchholzMode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800"></div>
            <span>{t('tournaments.detail.best_rival')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800"></div>
            <span>{t('tournaments.detail.worst_rival')}</span>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
          {t('tournaments.detail.matrix_virtual_legend')}
        </p>
        <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
          {t('tournaments.detail.matrix_round_mode_line', { mode: t(modeMeta.modeLabelI18nKey) })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="border border-gray-200 dark:border-gray-700 p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10">
                {t('tournaments.position_name')}
              </th>
              {standings.map((s, index) => (
                <th
                  key={s.player_id}
                  className="border border-gray-200 dark:border-gray-700 p-2 min-w-[40px] text-center"
                >
                  {index + 1}
                </th>
              ))}
              <th className="border border-gray-200 dark:border-gray-700 p-2 font-bold bg-violet-50 dark:bg-violet-950/30 min-w-[88px]">
                {t('tournaments.detail.matrix_virtual_column')}
              </th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 font-bold bg-blue-50 dark:bg-blue-900/20">
                {t('tournaments.buchholz_cut')}
              </th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 font-bold bg-blue-50 dark:bg-blue-900/20">
                {t('tournaments.median')}
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((rowPlayer, rowIndex) => {
              const playedOpponentsPoints: number[] = [];

              standings.forEach((colPlayer) => {
                if (matrixData[rowPlayer.player_id]?.[colPlayer.player_id]) {
                  playedOpponentsPoints.push(colPlayer.total_points);
                }
              });

              const minPoints =
                playedOpponentsPoints.length > 0 ? Math.min(...playedOpponentsPoints) : -1;
              const maxPoints =
                playedOpponentsPoints.length > 0 ? Math.max(...playedOpponentsPoints) : -1;

              let firstMaxId = -1;
              let lastMinId = -1;

              if (playedOpponentsPoints.length > 1) {
                for (const colPlayer of standings) {
                  const timesPlayed = matrixData[rowPlayer.player_id]?.[colPlayer.player_id] || 0;
                  if (timesPlayed > 0 && colPlayer.total_points === maxPoints) {
                    firstMaxId = colPlayer.player_id;
                    break;
                  }
                }

                for (let i = standings.length - 1; i >= 0; i--) {
                  const colPlayer = standings[i];
                  const timesPlayed = matrixData[rowPlayer.player_id]?.[colPlayer.player_id] || 0;
                  if (timesPlayed > 0 && colPlayer.total_points === minPoints) {
                    lastMinId = colPlayer.player_id;
                    break;
                  }
                }
              }

              const byeRounds = byeRoundsByPlayer[rowPlayer.player_id] ?? [];
              return (
                <tr
                  key={rowPlayer.player_id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="border border-gray-200 dark:border-gray-700 p-2 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10 whitespace-nowrap">
                    {rowIndex + 1}. {rowPlayer.player_name}
                  </td>
                  {standings.map((colPlayer) => {
                    const timesPlayed = matrixData[rowPlayer.player_id]?.[colPlayer.player_id] || 0;
                    const points = timesPlayed > 0 ? colPlayer.total_points : undefined;

                    let isMin = false;
                    let isMax = false;

                    if (points !== undefined && playedOpponentsPoints.length > 1) {
                      if (points === maxPoints && colPlayer.player_id === firstMaxId) isMax = true;
                      if (points === minPoints && colPlayer.player_id === lastMinId) isMin = true;
                    }

                    let bgColor = '';
                    if (isMin)
                      bgColor = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
                    if (isMax)
                      bgColor =
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
                    if (rowPlayer.player_id === colPlayer.player_id)
                      bgColor = 'bg-gray-100 dark:bg-gray-800';

                    let content: ReactNode = '';
                    if (timesPlayed > 0) {
                      if (timesPlayed === 1) {
                        content = points;
                      } else {
                        content = `(${Array(timesPlayed).fill(points).join(' + ')})`;
                      }
                    } else if (rowPlayer.player_id === colPlayer.player_id) {
                      content = '—';
                    }

                    return (
                      <td
                        key={colPlayer.player_id}
                        className={`border border-gray-200 dark:border-gray-700 p-2 text-center font-medium ${bgColor}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                  <td className="border border-gray-200 dark:border-gray-700 p-2 text-center align-top bg-violet-50/80 dark:bg-violet-950/20">
                    {byeRounds.length === 0 || !matrixTiebreakData || !buchholzOpts ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : (
                      <div className="flex flex-col gap-1 items-center">
                        {byeRounds.map((rn) => {
                          const disp = TiebreakService.getBuchholzVirtualDisplayForByeRound(
                            rn,
                            matrixTiebreakData,
                            buchholzOpts
                          );
                          if (disp === 'legacy') {
                            return (
                              <div
                                key={rn}
                                className="leading-tight text-[11px] text-gray-600 dark:text-gray-400"
                              >
                                {t('tournaments.detail.matrix_bye_no_virtual', { round: rn })}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={rn}
                              className="leading-tight"
                              title={
                                disp.kind === 'field_avg'
                                  ? t('tournaments.detail.matrix_virtual_kind_avg')
                                  : t('tournaments.detail.matrix_virtual_kind_worst')
                              }
                            >
                              <span className="font-mono font-semibold">
                                {Number.isInteger(disp.value)
                                  ? String(disp.value)
                                  : disp.value.toFixed(1)}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400 ml-0.5">R{rn}</span>
                              <span className="block text-[10px] text-violet-700 dark:text-violet-300">
                                {disp.kind === 'field_avg'
                                  ? t('tournaments.detail.matrix_virtual_abbr_avg')
                                  : t('tournaments.detail.matrix_virtual_abbr_worst')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 p-2 text-center font-bold bg-blue-50 dark:bg-blue-900/20">
                    {rowPlayer.tiebreak_values['opponent_points_drop_worst']?.toFixed(0) || '-'}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 p-2 text-center font-bold bg-blue-50 dark:bg-blue-900/20">
                    {rowPlayer.tiebreak_values['opponent_points_drop_best_worst']?.toFixed(0) ||
                      '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
