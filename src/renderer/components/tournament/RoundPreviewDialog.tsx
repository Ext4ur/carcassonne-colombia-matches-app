/* eslint-disable @typescript-eslint/no-explicit-any */
import Modal from '../common/Modal';
import Button from '../common/Button';
import Table, { Column } from '../common/Table';

interface RoundPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  previewData: {
    matches: Array<{
      player1: any;
      player2?: any;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
  } | null;
}

export default function RoundPreviewDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  previewData,
}: RoundPreviewDialogProps) {
  if (!previewData) return null;

  const columns: Column<any>[] = [
    {
      key: 'table',
      header: 'Mesa',
      render: (_, index) => (index ?? 0) + 1,
    },
    {
      key: 'players',
      header: 'Enfrentamiento',
      render: (match) => {
        if (!match.player2) {
          return (
            <div className="flex items-center gap-2">
              <span className="font-bold text-orange-600">{match.player1.player_name}</span>
              <span className="text-xs text-gray-500">(Bye)</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <span>{match.player1.player_name}</span>
            <span className="text-gray-400 font-bold">vs</span>
            <span>{match.player2.player_name}</span>
          </div>
        );
      },
    },
    {
      key: 'start_player',
      header: 'Inicia 🎲',
      render: (match) => {
        if (!match.player2) return '-';
        if (!match.startPlayerId) return '?';
        const startPlayer =
          match.startPlayerId === match.player1.player_id ? match.player1 : match.player2;
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              {startPlayer.player_name} 🎲
            </span>
            {match.reason && (
              <span className="text-xs text-gray-500 capitalize">
                {match.reason === 'balance'
                  ? '⚖️ Equilibrio'
                  : match.reason === 'recency'
                    ? '🕒 Tiempo'
                    : '🎲 Azar'}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Previsualización de Ronda"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} isLoading={isLoading}>
            Confirmar y Generar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Estos son los emparejamientos propuestos para la siguiente ronda. El sistema ha
            calculado automáticamente quién debería iniciar la partida.
          </p>
        </div>

        {previewData.warnings.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800">
            <h4 className="font-bold text-yellow-800 dark:text-yellow-200 text-sm mb-1">
              Advertencias:
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
