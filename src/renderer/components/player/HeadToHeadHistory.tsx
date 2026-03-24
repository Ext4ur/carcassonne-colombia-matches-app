import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeadToHeadRecord, HeadToHeadService } from '../../services/headToHead';
import { Player } from '../../types/player';
import Modal from '../common/Modal';

interface HeadToHeadHistoryProps {
  player1: Player;
  player2: Player;
  onClose: () => void;
}

export default function HeadToHeadHistory({ player1, player2, onClose }: HeadToHeadHistoryProps) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<HeadToHeadRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHeadToHead = async () => {
      if (!player1.id || !player2.id) return;
      try {
        setIsLoading(true);
        const h2h = await HeadToHeadService.getHeadToHead(player1.id, player2.id);
        setRecord(h2h);
      } catch (error) {
        console.error('Error loading head-to-head:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHeadToHead();
  }, [player1.id, player2.id]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('players.head_to_head.modal_title', { p1: player1.name, p2: player2.name })}
      size="xl"
    >
      {isLoading ? (
        <div className="text-center py-8">{t('players.head_to_head.loading')}</div>
      ) : !record ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          {t('players.head_to_head.empty')}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player1.name}</div>
              <div className="text-2xl font-bold text-green-600">{record.player1Wins}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('players.head_to_head.wins')}
              </div>
            </div>
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {t('players.head_to_head.ties_header')}
              </div>
              <div className="text-2xl font-bold">{record.ties}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('players.head_to_head.matches_sub')}
              </div>
            </div>
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player2.name}</div>
              <div className="text-2xl font-bold text-green-600">{record.player2Wins}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('players.head_to_head.wins')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player1.name}</div>
              <div className="text-xl font-bold">{record.player1TotalPoints}</div>
              <div className="text-xs text-gray-500">{t('players.head_to_head.total_points')}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player2.name}</div>
              <div className="text-xl font-bold">{record.player2TotalPoints}</div>
              <div className="text-xs text-gray-500">{t('players.head_to_head.total_points')}</div>
            </div>
          </div>

          {record.matches.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4">{t('players.head_to_head.history_title')}</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.head_to_head.col_tournament')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.head_to_head.col_round')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {player1.name}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {player2.name}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.head_to_head.col_result')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {record.matches.map((match, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm">{match.tournament}</td>
                        <td className="px-4 py-2 text-sm">
                          {t('players.head_to_head.round_n', { n: match.round })}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {t('players.head_to_head.pos_pts', {
                            pos: match.player1Position,
                            pts: match.player1Points,
                          })}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {t('players.head_to_head.pos_pts', {
                            pos: match.player2Position,
                            pts: match.player2Points,
                          })}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {match.player1Position < match.player2Position ? (
                            <span className="text-green-600 font-medium">
                              {t('players.head_to_head.outcome_winner', { name: player1.name })}
                            </span>
                          ) : match.player2Position < match.player1Position ? (
                            <span className="text-green-600 font-medium">
                              {t('players.head_to_head.outcome_winner', { name: player2.name })}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">
                              {t('players.head_to_head.outcome_tie')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
