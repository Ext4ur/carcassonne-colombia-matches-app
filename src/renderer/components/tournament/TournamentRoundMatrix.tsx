import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseService } from '../../services/database';
import {
  BuchholzByeMode,
  Match,
  MatchResultWithPlayer,
  PlayerStanding,
} from '../../types/tournament';
import { TiebreakData, TiebreakService, TiebreakCalculateOptions } from '../../services/tiebreak';
import { getBuchholzModeMeta } from '../../utils/buchholzModeMeta';

interface TournamentRoundMatrixProps {
  tournamentId: number;
  standings: PlayerStanding[];
}

export default function TournamentRoundMatrix({
  tournamentId,
  standings,
}: TournamentRoundMatrixProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [buchholzMode, setBuchholzMode] = useState<BuchholzByeMode>('legacy');
  const [roundNumbers, setRoundNumbers] = useState<number[]>([]);
  const [realByPlayerRound, setRealByPlayerRound] = useState<
    Record<number, Record<number, number>>
  >({});
  const [byeKeyList, setByeKeyList] = useState<string[]>([]);
  const [roundMatrixData, setRoundMatrixData] = useState<TiebreakData | null>(null);
  const [roundMatrixOpts, setRoundMatrixOpts] = useState<TiebreakCalculateOptions | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [roundsRaw, config, tournament] = await Promise.all([
          DatabaseService.getTournamentRounds(tournamentId),
          DatabaseService.getTournamentConfig(tournamentId),
          DatabaseService.getTournamentById(tournamentId),
        ]);
        const roundsSorted = [...roundsRaw].sort((a, b) => a.round_number - b.round_number);
        const mode = (config?.buchholz_bye_mode ?? 'legacy') as BuchholzByeMode;
        setBuchholzMode(mode);

        const roundMatchesByRound: Match[][] = [];
        const resultsByMatch: Record<number, MatchResultWithPlayer[]> = {};
        for (const round of roundsSorted) {
          const matches = await DatabaseService.getRoundMatches(round.id!);
          roundMatchesByRound.push(matches);
          for (const match of matches) {
            resultsByMatch[match.id!] = (await DatabaseService.getMatchResults(
              match.id!,
              tournamentId
            )) as MatchResultWithPlayer[];
          }
        }

        const scheduledN = tournament?.number_of_rounds ?? 0;
        const maxRoundNo =
          roundsSorted.length > 0 ? Math.max(...roundsSorted.map((r) => r.round_number)) : 0;
        const numberOfRounds = Math.max(1, scheduledN, maxRoundNo, roundsSorted.length);
        const roundsPlanned = Array.from({ length: numberOfRounds }, (_, i) => i + 1);
        setRoundNumbers(roundsPlanned);

        const playerTotalPoints: Record<number, number> = {};
        standings.forEach((s) => {
          playerTotalPoints[s.player_id] = s.total_points;
        });
        const avg =
          standings.length > 0
            ? standings.reduce((sum, p) => sum + p.total_points, 0) / standings.length
            : 0;
        const tData: TiebreakData = {
          rounds: roundsSorted,
          roundMatches: roundMatchesByRound,
          resultsByMatch,
          playerTotalPoints,
        };
        const opts: TiebreakCalculateOptions = {
          buchholzByeMode: mode,
          numberOfRounds,
          tournamentPointsAverage: avg,
        };

        const byeKeys = TiebreakService.byePlayerRoundKeys(
          roundsSorted,
          roundMatchesByRound,
          resultsByMatch
        );

        const realMap: Record<number, Record<number, number>> = {};

        for (const s of standings) {
          const pid = s.player_id;
          realMap[pid] = {};
          for (let rn = 1; rn <= numberOfRounds; rn++) {
            if (byeKeys.has(`${pid}:${rn}`)) continue;
            const idx = roundsSorted.findIndex((r) => r.round_number === rn);
            if (
              idx >= 0 &&
              TiebreakService.playerPlayedRound(idx, pid, roundMatchesByRound, resultsByMatch)
            ) {
              realMap[pid][rn] = TiebreakService.opponentTournamentPointsSumInRound(
                idx,
                pid,
                roundMatchesByRound,
                resultsByMatch,
                playerTotalPoints
              );
            }
          }
        }

        setRealByPlayerRound(realMap);
        setByeKeyList([...byeKeys]);
        setRoundMatrixData(tData);
        setRoundMatrixOpts(opts);
      } catch (e) {
        console.error('Error loading round matrix', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId, standings]);

  const byeSet = useMemo(() => new Set(byeKeyList), [byeKeyList]);

  if (loading) return <div className="p-4">{t('common.loading')}</div>;
  const modeMeta = getBuchholzModeMeta(buchholzMode);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('tournaments.detail.matrix_round_mode_line', { mode: t(modeMeta.modeLabelI18nKey) })}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('tournaments.detail.matrix_round_help')}
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="border border-gray-200 dark:border-gray-700 p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10">
                {t('tournaments.position_name')}
              </th>
              {roundNumbers.map((rn) => (
                <th
                  key={rn}
                  className="border border-gray-200 dark:border-gray-700 p-2 min-w-[56px] text-center"
                >
                  R{rn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((player, idx) => (
              <tr key={player.player_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="border border-gray-200 dark:border-gray-700 p-2 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10 whitespace-nowrap">
                  {idx + 1}. {player.player_name}
                </td>
                {roundNumbers.map((rn) => {
                  const byeKey = `${player.player_id}:${rn}`;
                  if (byeSet.has(byeKey) && roundMatrixData && roundMatrixOpts) {
                    const disp = TiebreakService.getBuchholzVirtualDisplayForByeRound(
                      rn,
                      roundMatrixData,
                      roundMatrixOpts
                    );
                    if (disp !== 'legacy') {
                      return (
                        <td
                          key={rn}
                          className="border border-gray-200 dark:border-gray-700 p-2 text-center font-medium bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200"
                          title={
                            disp.kind === 'field_avg'
                              ? t('tournaments.detail.matrix_virtual_kind_avg')
                              : t('tournaments.detail.matrix_virtual_kind_worst')
                          }
                        >
                          <span className="font-semibold">
                            {t('tournaments.detail.matrix_round_virtual_prefix')}
                          </span>{' '}
                          {Number.isInteger(disp.value) ? disp.value : disp.value.toFixed(1)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={rn}
                        className="border border-gray-200 dark:border-gray-700 p-2 text-center text-xs text-gray-600 dark:text-gray-400"
                      >
                        {t('tournaments.detail.matrix_bye_no_virtual_short', { round: rn })}
                      </td>
                    );
                  }
                  const real = realByPlayerRound[player.player_id]?.[rn];
                  if (real !== undefined) {
                    return (
                      <td
                        key={rn}
                        className="border border-gray-200 dark:border-gray-700 p-2 text-center font-medium"
                      >
                        {Number.isInteger(real) ? real : real.toFixed(1)}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={rn}
                      className="border border-gray-200 dark:border-gray-700 p-2 text-center text-gray-400 dark:text-gray-500"
                    >
                      —
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
