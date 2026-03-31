/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  TournamentConfig,
  TiebreakCriterion,
  ScoringSystem,
  BuchholzByeMode,
} from '../../types/tournament';
import { getDefaultScoringSystem } from '../../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../../utils/tiebreak';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useTranslation } from 'react-i18next';
import BuchholzModeHelpModal from './BuchholzModeHelpModal';

interface TournamentConfigProps {
  tournamentId: number;
  playersPerMatch: number;
  config?: TournamentConfig;
  onSave: (
    config: Partial<TournamentConfig> & {
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
      pairing_algorithm?: 'greedy' | 'backtracking';
      buchholz_bye_mode?: BuchholzByeMode;
    }
  ) => void;
  onCancel: () => void;
  /** Si es false, no se muestra el botón Cancelar (p. ej. ajustes solo en localStorage). */
  showCancel?: boolean;
  /** Solo lectura: mismos campos deshabilitados, sin guardar ni reordenar tiebreaks. */
  readOnly?: boolean;
  /** Etiqueta del botón secundario (p. ej. Cerrar en modo lectura). */
  cancelLabel?: string;
}

export default function TournamentConfigComponent({
  tournamentId,
  playersPerMatch,
  config,
  onSave,
  onCancel,
  showCancel = true,
  readOnly = false,
  cancelLabel,
}: TournamentConfigProps) {
  const { t } = useTranslation();
  const [tiebreakCriteria, setTiebreakCriteria] = useState<TiebreakCriterion[]>(
    config?.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA
  );
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>(
    config?.scoring_system || getDefaultScoringSystem(playersPerMatch)
  );
  const [avoidRematches, setAvoidRematches] = useState(config?.avoid_rematches ?? true);
  const [byeSelection, setByeSelection] = useState<'worst' | 'random' | 'round_robin'>(
    config?.bye_selection ?? 'worst'
  );
  const [playerDisplayMode, setPlayerDisplayMode] = useState<
    'per_player' | 'names_only' | 'usernames_only'
  >(config?.player_display_mode ?? 'per_player');
  const [pairingAlgorithm, setPairingAlgorithm] = useState<'greedy' | 'backtracking'>(
    (config as any)?.pairing_algorithm ?? 'greedy'
  );
  const [buchholzByeMode, setBuchholzByeMode] = useState<BuchholzByeMode>(
    (config as TournamentConfig)?.buchholz_bye_mode ?? 'legacy'
  );
  const [isBuchholzHelpOpen, setIsBuchholzHelpOpen] = useState(false);

  const handleDragEnd = (result: any) => {
    if (readOnly) return;
    if (!result.destination) return;

    const items = Array.from(tiebreakCriteria);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order
    const updated = items.map((item, index) => ({
      ...item,
      order: index + 1,
    }));

    setTiebreakCriteria(updated);
  };

  const toggleCriterion = (id: string) => {
    setTiebreakCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const updateScoring = (position: number, value: string) => {
    const numValue = value === '' ? 0 : Number(value);
    setScoringSystem((prev) => ({
      ...prev,
      [position]: numValue,
    }));
  };

  const handleSubmit = () => {
    onSave({
      tournament_id: tournamentId,
      avoid_rematches: avoidRematches,
      tiebreak_criteria: tiebreakCriteria,
      scoring_system: scoringSystem,
      bye_selection: byeSelection,
      player_display_mode: playerDisplayMode,
      pairing_algorithm: pairingAlgorithm,
      buchholz_bye_mode: buchholzByeMode,
    });
  };

  const secondaryBtnLabel = cancelLabel ?? t('common.cancel');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={avoidRematches}
              disabled={readOnly}
              onChange={(e) => setAvoidRematches(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('tournaments.config.avoid_rematches')}
            </span>
          </label>
        </div>

        <div>
          <Select
            label={t('tournaments.config.bye_selection')}
            value={byeSelection}
            disabled={readOnly}
            onChange={(e) => setByeSelection(e.target.value as 'worst' | 'random' | 'round_robin')}
            options={[
              { value: 'worst', label: t('tournaments.config.bye_worst') },
              { value: 'random', label: t('tournaments.config.bye_random') },
              { value: 'round_robin', label: t('tournaments.config.bye_round_robin') },
            ]}
            helperText={t('tournaments.config.bye_help')}
          />
        </div>

        <div>
          <Select
            label={t('tournaments.config.display_mode')}
            value={playerDisplayMode}
            disabled={readOnly}
            onChange={(e) =>
              setPlayerDisplayMode(e.target.value as 'per_player' | 'names_only' | 'usernames_only')
            }
            options={[
              {
                value: 'per_player',
                label: t('tournaments.config.display_default'),
              },
              { value: 'names_only', label: t('tournaments.config.display_names') },
              { value: 'usernames_only', label: t('tournaments.config.display_usernames') },
            ]}
            helperText={t('tournaments.config.display_help')}
          />
        </div>

        <div>
          <Select
            label={t('tournaments.config.pairing_algorithm')}
            value={pairingAlgorithm}
            disabled={readOnly}
            onChange={(e) => setPairingAlgorithm(e.target.value as 'greedy' | 'backtracking')}
            options={[
              { value: 'greedy', label: t('tournaments.config.pairing_greedy') },
              { value: 'backtracking', label: t('tournaments.config.pairing_backtracking') },
            ]}
            helperText={t('tournaments.config.pairing_help')}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('tournaments.config.buchholz_bye_mode')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setIsBuchholzHelpOpen(true)}>
              {t('tournaments.config.buchholz_help_button')}
            </Button>
          </div>
          <Select
            label=""
            value={buchholzByeMode}
            disabled={readOnly}
            onChange={(e) => setBuchholzByeMode(e.target.value as BuchholzByeMode)}
            options={[
              { value: 'legacy', label: t('tournaments.config.buchholz_bye_legacy') },
              { value: 'n_minus_1', label: t('tournaments.config.buchholz_bye_n_minus_1') },
              {
                value: 'legacy_virtual_avg',
                label: t('tournaments.config.buchholz_bye_legacy_virtual'),
              },
              {
                value: 'n_minus_1_virtual_avg',
                label: t('tournaments.config.buchholz_bye_n_minus_1_virtual'),
              },
              {
                value: 'legacy_virtual_worst',
                label: t('tournaments.config.buchholz_bye_legacy_virtual_worst'),
              },
              {
                value: 'n_minus_1_virtual_worst',
                label: t('tournaments.config.buchholz_bye_n_minus_1_virtual_worst'),
              },
            ]}
            helperText={t('tournaments.config.buchholz_bye_help')}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">{t('tournaments.config.tiebreaks_title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('tournaments.config.tiebreaks_help')}
        </p>
        {readOnly ? (
          <div className="space-y-2">
            {tiebreakCriteria.map((criterion) => (
              <div
                key={criterion.id}
                className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <input
                  type="checkbox"
                  checked={criterion.enabled}
                  disabled
                  readOnly
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 opacity-70"
                />
                <span className="flex-1 text-sm">
                  {t(`tiebreaks.${criterion.id}`, { defaultValue: criterion.name })}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">#{criterion.order}</span>
              </div>
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tiebreak-criteria">
              {(provided: any) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {tiebreakCriteria.map((criterion, index) => (
                    <Draggable key={criterion.id} draggableId={criterion.id} index={index}>
                      {(provided: any, snapshot: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${
                            snapshot.isDragging ? 'shadow-lg' : ''
                          }`}
                        >
                          <div {...provided.dragHandleProps} className="cursor-move">
                            <svg
                              className="w-5 h-5 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 8h16M4 16h16"
                              />
                            </svg>
                          </div>
                          <input
                            type="checkbox"
                            checked={criterion.enabled}
                            onChange={() => toggleCriterion(criterion.id)}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="flex-1 text-sm">
                            {t(`tiebreaks.${criterion.id}`, { defaultValue: criterion.name })}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            #{criterion.order}
                          </span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">{t('tournaments.config.scoring_title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('tournaments.config.scoring_help')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].slice(0, playersPerMatch).map((position) => (
            <Input
              key={position}
              label={t('tournaments.config.position_n', { position })}
              type="number"
              disabled={readOnly}
              value={scoringSystem[position]?.toString() || '0'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  updateScoring(position, '0');
                } else {
                  const numValue = parseInt(value, 10);
                  if (!isNaN(numValue) && numValue >= 0) {
                    updateScoring(position, numValue.toString());
                  }
                }
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        {showCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {secondaryBtnLabel}
          </Button>
        )}
        {!readOnly && <Button onClick={handleSubmit}>{t('tournaments.config.save_config')}</Button>}
      </div>
      <BuchholzModeHelpModal
        isOpen={isBuchholzHelpOpen}
        onClose={() => setIsBuchholzHelpOpen(false)}
      />
    </div>
  );
}
