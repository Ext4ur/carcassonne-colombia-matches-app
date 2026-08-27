import { useEffect, useState } from 'react';
import { DatabaseService } from '../../services/database';
import {
  BuchholzByeMode,
  Match,
  MatchResultWithPlayer,
  PlayerStanding,
} from '../../types/tournament';
import { TiebreakData, TiebreakCalculateOptions, TiebreakService } from '../../services/tiebreak';

export type TournamentTiebreakMatrixData = {
  roundsSorted: { round_number: number }[];
  roundMatchesByRound: Match[][];
  resultsByMatch: Record<number, MatchResultWithPlayer[]>;
  tiebreakData: TiebreakData;
  buchholzOpts: TiebreakCalculateOptions;
  buchholzMode: BuchholzByeMode;
  byeKeys: Set<string>;
  byeRoundsByPlayer: Record<number, number[]>;
};

export function useTournamentTiebreakMatrixData(
  tournamentId: number,
  standings: PlayerStanding[]
): { loading: boolean; data: TournamentTiebreakMatrixData | null } {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TournamentTiebreakMatrixData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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

        const buchholzMode = (config?.buchholz_bye_mode ?? 'legacy') as BuchholzByeMode;
        const scheduledN = tournament?.number_of_rounds ?? 0;
        const maxRoundNo =
          roundsSorted.length > 0 ? Math.max(...roundsSorted.map((r) => r.round_number)) : 0;
        const numberOfRounds = Math.max(1, scheduledN, maxRoundNo, roundsSorted.length);
        const avg =
          standings.length > 0
            ? standings.reduce((s, x) => s + x.total_points, 0) / standings.length
            : 0;

        const buchholzOpts: TiebreakCalculateOptions = {
          buchholzByeMode: buchholzMode,
          numberOfRounds,
          tournamentPointsAverage: avg,
        };

        const byeKeys = TiebreakService.byePlayerRoundKeys(
          roundsSorted,
          roundMatchesByRound,
          resultsByMatch
        );
        const byeRoundsByPlayer: Record<number, number[]> = {};
        byeKeys.forEach((key) => {
          const [pidStr, rnStr] = key.split(':');
          const pid = Number(pidStr);
          const rn = Number(rnStr);
          if (!byeRoundsByPlayer[pid]) byeRoundsByPlayer[pid] = [];
          byeRoundsByPlayer[pid].push(rn);
        });
        Object.keys(byeRoundsByPlayer).forEach((k) => {
          byeRoundsByPlayer[Number(k)]!.sort((a, b) => a - b);
        });

        if (!cancelled) {
          setData({
            roundsSorted,
            roundMatchesByRound,
            resultsByMatch,
            tiebreakData,
            buchholzOpts,
            buchholzMode,
            byeKeys,
            byeRoundsByPlayer,
          });
        }
      } catch (error) {
        console.error('Error loading tiebreak matrix data:', error);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, standings]);

  return { loading, data };
}
