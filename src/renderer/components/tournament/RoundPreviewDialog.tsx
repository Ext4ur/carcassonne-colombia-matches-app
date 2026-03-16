/* eslint-disable @typescript-eslint/no-explicit-any */
import Modal from '../common/Modal';
import Button from '../common/Button';
import Table, { Column } from '../common/Table';
import { useTranslation } from 'react-i18next';

interface RoundPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  onManualPairing?: () => void;
  previewData: {
    matches: Array<{
      player1: any;
      player2?: any;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats?: Record<number, { totalStarts: number; lastStartRound: number }>;
    previousOpponents?: Record<number, number[]>;
  } | null;
}

export default function RoundPreviewDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  onManualPairing,
  previewData,
}: RoundPreviewDialogProps) {
  const { t } = useTranslation();

  if (!previewData) return null;

  const columns: Column<any>[] = [
    {
      key: 'table',
      header: t('tournaments.preview.table_number', 'Mesa'),
      render: (_, index) => (index ?? 0) + 1,
    },
    {
      key: 'players',
      header: t('tournaments.preview.table_encounter'),
      render: (match) => {
        if (!match.player2) {
          return (
            <div className="flex items-center gap-2">
              <span className="font-bold text-orange-600">{match.player1.player_name}</span>
              <span className="text-xs text-gray-500">{t('tournaments.preview.table_bye')}</span>
            </div>
          );
        }

        const startPlayerId = match.startPlayerId;
        const player1Stats = previewData.startStats?.[match.player1.player_id];
        const player2Stats = previewData.startStats?.[match.player2.player_id];

        const renderPlayer = (player: any, stats: any) => {
          const isStarter = startPlayerId === player.player_id;
          return (
            <div
              className={`flex flex-col ${isStarter ? 'bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800' : 'p-2'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${isStarter ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}
                >
                  {player.player_name}
                </span>
                {isStarter && <span title={t('tournaments.preview.inits')}>🎲</span>}
              </div>
              {stats && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('tournaments.preview.table_starts')} {stats.totalStarts}
                  {stats.lastStartRound > 0 && ` (R${stats.lastStartRound})`}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="flex items-center gap-4">
            <div className="flex-1">{renderPlayer(match.player1, player1Stats)}</div>
            <div className="flex flex-col items-center">
              <span className="text-gray-400 font-bold text-sm">VS</span>
              {match.reason && startPlayerId && (
                <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                  {match.reason === 'balance'
                    ? t('tournaments.preview.table_balance')
                    : match.reason === 'recency'
                      ? t('tournaments.preview.table_time')
                      : t('tournaments.preview.table_random')}
                </span>
              )}
            </div>
            <div className="flex-1">{renderPlayer(match.player2, player2Stats)}</div>
          </div>
        );
      },
      width: '70%',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tournaments.preview.title')}
      size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          <div>
            {onManualPairing && (
              <Button variant="secondary" onClick={onManualPairing} disabled={isLoading}>
                {t('tournaments.detail.manual_pairings')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              {t('tournaments.preview.cancel', 'Cancelar')}
            </Button>
            <Button onClick={onConfirm} isLoading={isLoading}>
              {t('tournaments.preview.confirm', 'Confirmar y Generar')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {t('tournaments.preview.description')}
          </p>
        </div>

        {previewData.warnings.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800">
            <h4 className="font-bold text-yellow-800 dark:text-yellow-200 text-sm mb-1">
              {t('tournaments.preview.warnings')}
            </h4>
            <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
              {previewData.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <Table
            columns={columns}
            data={previewData.matches}
            keyExtractor={(m) => `${m.player1.player_id}-${m.player2?.player_id ?? 'bye'}`}
          />
        </div>
      </div>
    </Modal>
  );
}
