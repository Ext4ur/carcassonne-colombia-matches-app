import { useState, useEffect } from 'react';
import { DatabaseService } from '../../services/database';
import { PlayerStanding, MatchResultWithPlayer } from '../../types/tournament';
import { useTranslation } from 'react-i18next';

interface TournamentMatrixProps {
  tournamentId: number;
  standings: PlayerStanding[];
}

interface MatrixData {
  [playerId: number]: {
    [opponentId: number]: number; // Points scored BY opponent
  };
}

export default function TournamentMatrix({ tournamentId, standings }: TournamentMatrixProps) {
  const { t } = useTranslation();
  const [matrixData, setMatrixData] = useState<MatrixData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatrixData = async () => {
      setLoading(true);
      try {
        const rounds = await DatabaseService.getTournamentRounds(tournamentId);
        const allResults: MatchResultWithPlayer[][] = [];

        for (const round of rounds) {
          const matches = await DatabaseService.getRoundMatches(round.id!);
          for (const match of matches) {
            const results = await DatabaseService.getMatchResults(match.id!, tournamentId);
            allResults.push(results as MatchResultWithPlayer[]);
          }
        }

        const data: MatrixData = {};

        allResults.forEach((matchResults) => {
          matchResults.forEach((res1) => {
            if (!data[res1.player_id]) data[res1.player_id] = {};

            matchResults.forEach((res2) => {
              if (res1.player_id !== res2.player_id) {
                // We just need to know they played to fetch opponent standings later
                data[res1.player_id][res2.player_id] = 1;
              }
            });
          });
        });

        setMatrixData(data);
      } catch (error) {
        console.error('Error fetching matrix data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatrixData();
  }, [tournamentId, t]);

  if (loading) return <div className="p-4">{t('common.loading')}</div>;

  return (
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

            return (
              <tr key={rowPlayer.player_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="border border-gray-200 dark:border-gray-700 p-2 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10 whitespace-nowrap">
                  {rowIndex + 1}. {rowPlayer.player_name}
                </td>
                {standings.map((colPlayer) => {
                  const played = matrixData[rowPlayer.player_id]?.[colPlayer.player_id];
                  const points = played ? colPlayer.total_points : undefined;

                  const isMin =
                    points !== undefined &&
                    points === minPoints &&
                    playedOpponentsPoints.length > 1;
                  const isMax =
                    points !== undefined &&
                    points === maxPoints &&
                    playedOpponentsPoints.length > 1;

                  let bgColor = '';
                  if (isMin)
                    bgColor = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
                  if (isMax)
                    bgColor =
                      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
                  if (rowPlayer.player_id === colPlayer.player_id)
                    bgColor = 'bg-gray-100 dark:bg-gray-800';

                  return (
                    <td
                      key={colPlayer.player_id}
                      className={`border border-gray-200 dark:border-gray-700 p-2 text-center font-medium ${bgColor}`}
                    >
                      {points !== undefined
                        ? points
                        : rowPlayer.player_id === colPlayer.player_id
                          ? '—'
                          : ''}
                    </td>
                  );
                })}
                <td className="border border-gray-200 dark:border-gray-700 p-2 text-center font-bold bg-blue-50 dark:bg-blue-900/20">
                  {rowPlayer.tiebreak_values['opponent_points_drop_worst']?.toFixed(0) || '-'}
                </td>
                <td className="border border-gray-200 dark:border-gray-700 p-2 text-center font-bold bg-blue-50 dark:bg-blue-900/20">
                  {rowPlayer.tiebreak_values['opponent_points_drop_best_worst']?.toFixed(0) || '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
