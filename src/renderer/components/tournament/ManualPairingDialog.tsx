/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { PlayerStanding } from '../../types/tournament';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../contexts/NotificationContext';

// Helper for strict mode with r-b-dnd
export const StrictModeDroppable = ({ children, ...props }: any) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);
  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
};

interface ManualPairingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pairings: any[]) => void;
  isLoading?: boolean;
  players: PlayerStanding[];
  roundNumber: number;
  previousOpponents?: Record<number, number[]>;
}

interface ColumnData {
  id: string;
  name: string;
  items: PlayerStanding[];
}

export default function ManualPairingDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  players,
  roundNumber,
  previousOpponents = {},
}: ManualPairingDialogProps) {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [columns, setColumns] = useState<Record<string, ColumnData>>({});

  useEffect(() => {
    if (isOpen) {
      const numTables = Math.ceil(players.length / 2);
      const initialColumns: Record<string, ColumnData> = {
        unassigned: {
          id: 'unassigned',
          name: t('tournaments.manual_pairing.bench_unassigned'),
          items: [...players],
        },
      };
      for (let i = 1; i <= numTables; i++) {
        initialColumns[`table-${i}`] = {
          id: `table-${i}`,
          name: t('tournaments.manual_pairing.table_n', { n: i }),
          items: [],
        };
      }
      setColumns(initialColumns);
    }
  }, [isOpen, players, t]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId !== destination.droppableId) {
      const sourceColumn = columns[source.droppableId];
      const destColumn = columns[destination.droppableId];

      // Limit tables to 2 players max
      if (destination.droppableId.startsWith('table-') && destColumn.items.length >= 2) {
        return; // Do nothing
      }

      const sourceItems = [...sourceColumn.items];
      const destItems = [...destColumn.items];
      const [removed] = sourceItems.splice(source.index, 1);
      destItems.splice(destination.index, 0, removed);

      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceColumn, items: sourceItems },
        [destination.droppableId]: { ...destColumn, items: destItems },
      });
    } else {
      const column = columns[source.droppableId];
      const copiedItems = [...column.items];
      const [removed] = copiedItems.splice(source.index, 1);
      copiedItems.splice(destination.index, 0, removed);

      setColumns({
        ...columns,
        [source.droppableId]: { ...column, items: copiedItems },
      });
    }
  };

  const handleConfirm = () => {
    if (columns['unassigned']?.items.length > 0) {
      addNotification({
        message: t('tournaments.manual_pairing.error_unassigned'),
        type: 'warning',
      });
      return;
    }

    const pairings = [];
    const numTables = Math.ceil(players.length / 2);

    for (let i = 1; i <= numTables; i++) {
      const tableItems = columns[`table-${i}`].items;
      if (tableItems.length === 2) {
        pairings.push({
          player1: tableItems[0],
          player2: tableItems[1],
        });
      } else if (tableItems.length === 1) {
        // Bye
        pairings.push({
          player1: tableItems[0],
        });
      }
    }

    onConfirm(pairings);
  };

  const isComplete = columns['unassigned']?.items.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tournaments.manual_pairing.title', { round: roundNumber })}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={!isComplete}
            variant={isComplete ? 'primary' : 'secondary'}
          >
            {t('tournaments.manual_pairing.confirm')}
          </Button>
        </>
      }
    >
      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
        {t('tournaments.manual_pairing.instruction')}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row gap-6">
          {/* BANCA */}
          <div className="w-full md:w-1/3 flex flex-col pt-1">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">
              {t('tournaments.manual_pairing.bench')} ({columns['unassigned']?.items.length || 0})
            </h3>
            <div className="flex-1 min-h-[400px]">
              <StrictModeDroppable droppableId="unassigned">
                {(provided: any, snapshot: any) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`h-full p-3 rounded-xl border-2 transition-colors ${
                      snapshot.isDraggingOver
                        ? 'bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-500'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                    }`}
                  >
                    {columns['unassigned']?.items.map((item, index) => (
                      <Draggable
                        key={item.player_id.toString()}
                        draggableId={item.player_id.toString()}
                        index={index}
                      >
                        {(provided: any, snapshot: any) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`mb-2 p-3 rounded-lg shadow-sm border ${
                              snapshot.isDragging
                                ? 'bg-white border-primary-500 shadow-md transform scale-105 z-50 dark:bg-gray-700'
                                : 'bg-white border-gray-300 hover:border-primary-400 dark:bg-gray-800 dark:border-gray-600'
                            }`}
                            style={{ ...provided.draggableProps.style }}
                          >
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {item.player_name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {t('tournaments.manual_pairing.wins')}: {item.wins} |{' '}
                              {t('tournaments.manual_pairing.pts_op')}:{' '}
                              {item.tiebreak_values['opponent_points_drop_worst']?.toFixed(1) || 0}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>
            </div>
          </div>

          {/* MESAS */}
          <div className="w-full md:w-2/3">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">
              {t('tournaments.manual_pairing.tables')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 pb-2">
              {Object.entries(columns)
                .filter(([id]) => id !== 'unassigned') // Solo mostrar mesas
                .map(([columnId, column]) => {
                  const isFull = column.items.length >= 2;
                  return (
                    <div key={columnId} className="flex flex-col">
                      <StrictModeDroppable droppableId={columnId} isDropDisabled={isFull}>
                        {(provided: any, snapshot: any) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={`p-3 rounded-xl border-2 min-h-[120px] transition-colors relative ${
                              snapshot.isDraggingOver && !isFull
                                ? 'bg-green-50 border-green-400 dark:bg-green-900/30'
                                : isFull
                                  ? 'bg-gray-100 border-gray-300 dark:bg-gray-750 dark:border-gray-600 opacity-90'
                                  : 'bg-white border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-600'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-bold text-sm text-gray-500 dark:text-gray-400">
                                {column.name}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${isFull ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                              >
                                {column.items.length}/2
                              </span>
                            </div>

                            <div className="space-y-2">
                              {column.items.map((item, index) => {
                                let hasRematch = false;
                                if (columnId.startsWith('table-') && column.items.length === 2) {
                                  const otherPlayer = column.items[index === 0 ? 1 : 0];
                                  if (
                                    previousOpponents[item.player_id]?.includes(
                                      otherPlayer.player_id
                                    )
                                  ) {
                                    hasRematch = true;
                                  }
                                }

                                return (
                                  <Draggable
                                    key={item.player_id.toString()}
                                    draggableId={item.player_id.toString()}
                                    index={index}
                                  >
                                    {(provided: any, snapshot: any) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`p-2 rounded-lg border shadow-sm transition-all ${
                                          snapshot.isDragging
                                            ? 'bg-blue-50 border-blue-400 z-50 dark:bg-blue-900'
                                            : hasRematch
                                              ? 'bg-orange-50 border-orange-300 dark:bg-orange-900/20 dark:border-orange-800'
                                              : 'bg-white border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                                        }`}
                                        style={{ ...provided.draggableProps.style }}
                                      >
                                        <div className="flex justify-between items-center">
                                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                            {item.player_name}
                                          </div>
                                          {hasRematch && (
                                            <span
                                              className="text-xs text-orange-600 dark:text-orange-400 font-bold flex items-center gap-1"
                                              title={t('tournaments.preview.rematch_detected')}
                                            >
                                              🔄
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                            </div>
                            {provided.placeholder}

                            {column.items.length === 0 && !snapshot.isDraggingOver && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none">
                                <span className="text-sm text-gray-400">
                                  {t('tournaments.manual_pairing.drag_here')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </StrictModeDroppable>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </DragDropContext>
    </Modal>
  );
}
