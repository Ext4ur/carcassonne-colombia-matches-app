/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
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
import { KNOCKOUT_SIZE_OPTIONS } from '../../types/knockout';
import type {
  KnockoutMatchStarter,
  KnockoutSeries,
  KnockoutSeriesStarterMode,
  KnockoutSize,
} from '../../types/knockout';

interface TournamentConfigProps {
  tournamentId: number;
  playersPerMatch: number;
  config?: TournamentConfig;
  /** Muestra top N y best-of para torneos swiss_knockout. */
  showKnockoutOptions?: boolean;
  /** Jugadores inscritos: limita opciones de top N al tamaño del plantel. */
  registeredPlayerCount?: number;
  /** Congela campos KO tras iniciar fase eliminatoria (suizo puede seguir readOnly por separado). */
  knockoutReadOnly?: boolean;
  onSave: (
    config: Partial<TournamentConfig> & {
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
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
  showKnockoutOptions = false,
  knockoutReadOnly = false,
  registeredPlayerCount,
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
  const [buchholzByeMode, setBuchholzByeMode] = useState<BuchholzByeMode>(
    (config as TournamentConfig)?.buchholz_bye_mode ?? 'legacy'
  );
  const [isBuchholzHelpOpen, setIsBuchholzHelpOpen] = useState(false);
  const [knockoutSize, setKnockoutSize] = useState(String(config?.knockout_size ?? 8));
  const [knockoutSeries, setKnockoutSeries] = useState<KnockoutSeries>(
    (config?.knockout_series as KnockoutSeries) ?? 'best_of_1'
  );
  const [playBronzeMatch, setPlayBronzeMatch] = useState(
    config?.knockout_play_bronze_match ?? false
  );
  const [matchStarter, setMatchStarter] = useState<KnockoutMatchStarter>(
    config?.knockout_match_starter ?? 'higher_swiss_seed'
  );
  const [seriesStarterMode, setSeriesStarterMode] = useState<KnockoutSeriesStarterMode>(
    config?.knockout_series_starter_mode ??
      (config?.knockout_series_alternate_starter ? 'previous_loser' : 'alternate')
  );

  const koFieldsDisabled = knockoutReadOnly;
  const canSave = !readOnly || !knockoutReadOnly;

  const availableKnockoutSizes = useMemo((): KnockoutSize[] => {
    if (!registeredPlayerCount || registeredPlayerCount < 2) {
      return [...KNOCKOUT_SIZE_OPTIONS];
    }
    return KNOCKOUT_SIZE_OPTIONS.filter((n) => n <= registeredPlayerCount);
  }, [registeredPlayerCount]);

  useEffect(() => {
    if (!showKnockoutOptions || availableKnockoutSizes.length === 0) return;
    const current = Number(knockoutSize);
    if (!availableKnockoutSizes.includes(current as KnockoutSize)) {
      setKnockoutSize(String(availableKnockoutSizes[availableKnockoutSizes.length - 1]));
    }
  }, [availableKnockoutSizes, knockoutSize, showKnockoutOptions]);

  useEffect(() => {
    if (!config) return;
    setTiebreakCriteria(config.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA);
    setScoringSystem(config.scoring_system || getDefaultScoringSystem(playersPerMatch));
    setAvoidRematches(config.avoid_rematches ?? true);
    setByeSelection(config.bye_selection ?? 'worst');
    setPlayerDisplayMode(config.player_display_mode ?? 'per_player');
    setBuchholzByeMode((config as TournamentConfig)?.buchholz_bye_mode ?? 'legacy');
    setKnockoutSize(String(config.knockout_size ?? 8));
    setKnockoutSeries((config.knockout_series as KnockoutSeries) ?? 'best_of_1');
    setPlayBronzeMatch(config.knockout_play_bronze_match ?? false);
    setMatchStarter(config.knockout_match_starter ?? 'higher_swiss_seed');
    setSeriesStarterMode(
      config.knockout_series_starter_mode ??
        (config.knockout_series_alternate_starter ? 'previous_loser' : 'alternate')
    );
  }, [config, playersPerMatch]);

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
      buchholz_bye_mode: buchholzByeMode,
      ...(showKnockoutOptions
        ? {
            knockout_size: Number(knockoutSize) as KnockoutSize,
            knockout_seeding: 'standard_bracket' as const,
            knockout_series: knockoutSeries,
            knockout_play_bronze_match: playBronzeMatch,
            knockout_match_starter: matchStarter,
            knockout_series_starter_mode: seriesStarterMode,
            knockout_series_alternate_starter: seriesStarterMode === 'previous_loser',
          }
        : {}),
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

      {showKnockoutOptions && (
        <div className="space-y-4 border-t border-gray-200 dark:border-gray-600 pt-4">
          <h3 className="text-lg font-medium">{t('knockout.config_title')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t('knockout.size_label')}
              value={knockoutSize}
              disabled={koFieldsDisabled}
              onChange={(e) => setKnockoutSize(e.target.value)}
              options={availableKnockoutSizes.map((n) => ({
                value: String(n),
                label: t('knockout.size_option', { count: n }),
              }))}
              helperText={
                registeredPlayerCount && registeredPlayerCount >= 2
                  ? t('knockout.size_player_limit_help', { count: registeredPlayerCount })
                  : t('knockout.size_fallback_help')
              }
            />
            <Select
              label={t('knockout.series_label')}
              value={knockoutSeries}
              disabled={koFieldsDisabled}
              onChange={(e) => setKnockoutSeries(e.target.value as KnockoutSeries)}
              options={[
                { value: 'best_of_1', label: t('knockout.series.best_of_1') },
                { value: 'best_of_3', label: t('knockout.series.best_of_3') },
              ]}
            />
            <Select
              label={t('knockout.bronze_match_label')}
              value={playBronzeMatch ? 'yes' : 'no'}
              disabled={koFieldsDisabled}
              onChange={(e) => setPlayBronzeMatch(e.target.value === 'yes')}
              options={[
                { value: 'no', label: t('knockout.option_no') },
                { value: 'yes', label: t('knockout.option_yes') },
              ]}
            />
            <Select
              label={t('knockout.match_starter_label')}
              value={matchStarter}
              disabled={koFieldsDisabled}
              onChange={(e) => setMatchStarter(e.target.value as KnockoutMatchStarter)}
              options={[
                {
                  value: 'higher_swiss_seed',
                  label: t('knockout.match_starter.higher_swiss_seed'),
                },
                { value: 'random', label: t('knockout.match_starter.random') },
              ]}
            />
            <Select
              label={t('knockout.series_starter_mode_label')}
              value={seriesStarterMode}
              disabled={koFieldsDisabled || knockoutSeries === 'best_of_1'}
              onChange={(e) => setSeriesStarterMode(e.target.value as KnockoutSeriesStarterMode)}
              options={[
                {
                  value: 'previous_loser',
                  label: t('knockout.series_starter_mode.previous_loser'),
                },
                { value: 'alternate', label: t('knockout.series_starter_mode.alternate') },
                { value: 'random', label: t('knockout.series_starter_mode.random') },
              ]}
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('knockout.config_hint')}</p>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        {showCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {secondaryBtnLabel}
          </Button>
        )}
        {canSave && <Button onClick={handleSubmit}>{t('tournaments.config.save_config')}</Button>}
      </div>
      <BuchholzModeHelpModal
        isOpen={isBuchholzHelpOpen}
        onClose={() => setIsBuchholzHelpOpen(false)}
      />
    </div>
  );
}
