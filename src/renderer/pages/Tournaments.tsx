/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { Tournament, TournamentConfig } from '../types/tournament';
import { Player } from '../types/player';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import IconActionButton, {
  EyeIcon,
  ExportIcon,
  TrashIcon,
} from '../components/common/IconActionButton';
import Modal from '../components/common/Modal';
import TournamentForm, { TournamentFormRef } from '../components/tournament/TournamentForm';
import QuickTournamentWizard, {
  QuickTournamentPayload,
} from '../components/tournament/QuickTournamentWizard';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import PlayerRegistration from '../components/tournament/PlayerRegistration';
import MultiSelect from '../components/common/MultiSelect';
import Input from '../components/common/Input';
import { Column } from '../components/common/Table';
import { Place } from '../types/place';
import { formatDateForDisplay } from '../utils/dateUtils';
import { useNotifications } from '../contexts/NotificationContext';
import { ExportService, isExportSubsetError } from '../services/export';
import { useTranslation } from 'react-i18next';
import { formatUserError } from '../utils/formatUserError';
import { isStoreMode } from '../utils/storeMode';
import { getEffectiveNumberOfRounds } from '../utils/tournament';
import {
  canCreateStoreTournament,
  filterTournamentsForStoreKiosk,
} from '../services/storeLifecycle';
import { resolveStorePlaceId } from '../services/storeLocation';

type WizardStep = 'quick' | 'form' | 'config' | 'registration' | null;

type ConfigDraft = Partial<TournamentConfig> & {
  bye_selection?: 'worst' | 'random' | 'round_robin';
};

export default function Tournaments() {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { t } = useTranslation();
  const storeMode = isStoreMode();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(null);
  const [tournamentDraft, setTournamentDraft] = useState<Partial<Tournament> | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>(null);
  const [registrationPlayers, setRegistrationPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [mode, setMode] = useState<'quick' | 'advanced'>('quick');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingTournamentId, setExportingTournamentId] = useState<number | null>(null);
  const formRef = useRef<TournamentFormRef>(null);

  const loadTournaments = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllTournaments();
      setTournaments(data);
    } catch (error) {
      console.error('Error loading tournaments:', error);
      addNotification({
        message: formatUserError(error, t('common.error_loading')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    loadTournaments();
    DatabaseService.getAllPlaces()
      .then(setPlaces)
      .catch(() => {});
  }, [loadTournaments]);

  useEffect(() => {
    const onSyncDataChanged = () => {
      loadTournaments();
    };
    window.addEventListener('sync:data-changed', onSyncDataChanged);
    return () => window.removeEventListener('sync:data-changed', onSyncDataChanged);
  }, [loadTournaments]);

  const handleCreateTournament = (createMode: 'quick' | 'advanced') => {
    if (storeMode && !canCreateStoreTournament(tournaments)) return;
    if (storeMode && createMode === 'advanced') return;
    setMode(createMode);
    setTournamentDraft(null);
    setConfigDraft(null);
    setRegistrationPlayers([]);
    setWizardStep(createMode === 'quick' ? 'quick' : 'form');
    setIsModalOpen(true);
  };

  const handleCancelWizard = () => {
    if (confirm(t('tournaments.wizard.cancel_confirm'))) {
      setIsModalOpen(false);
      setWizardStep(null);
      setTournamentDraft(null);
      setConfigDraft(null);
      setRegistrationPlayers([]);
    }
  };

  /** Form submit: no DB write, store draft and go to config or registration. */
  const handleFormSubmit = async (tournamentData: Partial<Tournament>) => {
    setTournamentDraft({
      name: tournamentData.name!,
      type: tournamentData.type!,
      circuit_id: tournamentData.circuit_id,
      date: tournamentData.date!,
      players_per_match: tournamentData.players_per_match || 2,
      number_of_rounds: tournamentData.number_of_rounds,
      place_id: tournamentData.place_id,
      competition_format: tournamentData.competition_format || 'swiss',
    });
    setWizardStep('config');
  };

  /** Config submit: no DB write, store draft and go to registration. */
  const handleConfigSubmit = (
    configData: Partial<TournamentConfig> & {
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
    }
  ) => {
    setConfigDraft({
      avoid_rematches: configData.avoid_rematches ?? true,
      tiebreak_criteria: configData.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
      scoring_system:
        configData.scoring_system ||
        getDefaultScoringSystem(tournamentDraft!.players_per_match || 2),
      bye_selection: configData.bye_selection || 'worst',
      player_display_mode: configData.player_display_mode ?? 'per_player',
      pairing_algorithm: configData.pairing_algorithm ?? 'greedy',
      buchholz_bye_mode: configData.buchholz_bye_mode ?? 'legacy',
      knockout_size: configData.knockout_size ?? 8,
      knockout_seeding: configData.knockout_seeding ?? 'standard_bracket',
      knockout_series: configData.knockout_series ?? 'best_of_1',
      knockout_play_bronze_match: configData.knockout_play_bronze_match ?? false,
      knockout_match_starter: configData.knockout_match_starter ?? 'higher_swiss_seed',
      knockout_series_starter_mode: configData.knockout_series_starter_mode,
      knockout_series_alternate_starter: configData.knockout_series_alternate_starter ?? false,
    });
    setWizardStep('registration');
  };

  const createTournamentFromDraft = async (
    numberOfRounds: number,
    overrides?: {
      tournamentDraft?: Partial<Tournament>;
      configDraft?: ConfigDraft | null;
      registrationPlayers?: Player[];
    }
  ): Promise<number | null> => {
    const draft = overrides?.tournamentDraft ?? tournamentDraft;
    const config = overrides?.configDraft !== undefined ? overrides.configDraft : configDraft;
    const players = overrides?.registrationPlayers ?? registrationPlayers;

    if (!draft?.name || !draft?.type || !draft?.date) {
      addNotification({ message: t('tournaments.wizard.missing_data'), type: 'error' });
      return null;
    }
    let placeId = draft.place_id;
    if (storeMode) {
      try {
        placeId = await resolveStorePlaceId(placeId, {
          cityName: (draft as { store_city_name?: string }).store_city_name ?? '',
          placeName: (draft as { store_place_name?: string }).store_place_name ?? '',
        });
      } catch {
        addNotification({ message: t('tournaments.form.store_location_error'), type: 'error' });
        return null;
      }
    }
    const tournamentId = await DatabaseService.createTournament({
      name: draft.name,
      type: draft.type,
      circuit_id: draft.circuit_id,
      date: draft.date,
      players_per_match: draft.players_per_match || 2,
      number_of_rounds: getEffectiveNumberOfRounds(numberOfRounds, players.length),
      place_id: placeId,
      competition_format: draft.competition_format || 'swiss',
    });
    if (config) {
      await DatabaseService.createTournamentConfig({
        tournament_id: tournamentId,
        avoid_rematches: config.avoid_rematches ?? true,
        tiebreak_criteria: config.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
        scoring_system:
          config.scoring_system || getDefaultScoringSystem(draft.players_per_match || 2),
        bye_selection: config.bye_selection || 'worst',
        player_display_mode: config.player_display_mode ?? 'per_player',
        pairing_algorithm: config.pairing_algorithm ?? 'greedy',
        buchholz_bye_mode: config.buchholz_bye_mode ?? 'legacy',
        knockout_size: config.knockout_size ?? 8,
        knockout_seeding: config.knockout_seeding ?? 'standard_bracket',
        knockout_series: config.knockout_series ?? 'best_of_1',
        knockout_play_bronze_match: config.knockout_play_bronze_match ?? false,
        knockout_match_starter: config.knockout_match_starter ?? 'higher_swiss_seed',
        knockout_series_starter_mode: config.knockout_series_starter_mode,
        knockout_series_alternate_starter: config.knockout_series_alternate_starter ?? false,
      });
    }
    for (const player of players) {
      if (player.id) {
        await DatabaseService.registerPlayerToTournament(tournamentId, player.id);
      }
    }
    return tournamentId;
  };

  const resetWizardForNewTournament = () => {
    setTournamentDraft(null);
    setConfigDraft(null);
    setRegistrationPlayers([]);
    setWizardStep('quick');
  };

  const handleQuickComplete = async (payload: QuickTournamentPayload) => {
    try {
      setIsLoading(true);
      const tournamentId = await createTournamentFromDraft(payload.numberOfRounds, {
        tournamentDraft: payload.tournament,
        configDraft: payload.config,
        registrationPlayers: payload.players,
      });
      if (tournamentId == null) return;
      setIsModalOpen(false);
      setWizardStep(null);
      setTournamentDraft(null);
      setConfigDraft(null);
      setRegistrationPlayers([]);
      loadTournaments();
      navigate(`/tournament/${tournamentId}`);
    } catch (error) {
      console.error('Error al crear el torneo:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.wizard.create_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCompleteAndAnother = async (payload: QuickTournamentPayload) => {
    try {
      setIsLoading(true);
      const tournamentId = await createTournamentFromDraft(payload.numberOfRounds, {
        tournamentDraft: payload.tournament,
        configDraft: payload.config,
        registrationPlayers: payload.players,
      });
      if (tournamentId == null) return;
      loadTournaments();
      resetWizardForNewTournament();
    } catch (error) {
      console.error('Error al crear el torneo:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.wizard.create_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationComplete = async (numberOfRounds: number) => {
    try {
      setIsLoading(true);
      const tournamentId = await createTournamentFromDraft(numberOfRounds);
      if (tournamentId == null) return;
      setIsModalOpen(false);
      setWizardStep(null);
      setTournamentDraft(null);
      setConfigDraft(null);
      setRegistrationPlayers([]);
      loadTournaments();
      navigate(`/tournament/${tournamentId}`);
    } catch (error) {
      console.error('Error al crear el torneo:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.wizard.create_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewTournament = (tournament: Tournament) => {
    navigate(`/tournament/${tournament.id}`);
  };

  const handleDelete = (tournament: Tournament) => {
    setDeleteTarget(tournament);
    setDeleteNameInput('');
    setIsDeleteModalOpen(true);
  };

  const handleExportTournament = async (tournament: Tournament) => {
    if (!tournament.id) return;
    try {
      setExportingTournamentId(tournament.id);
      await ExportService.exportSubset([tournament.id]);
      addNotification({
        message: t('settings.errors.export_success'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error exporting tournament:', error);
      const msg = isExportSubsetError(error)
        ? t('settings.export_no_selection')
        : formatUserError(error, t('settings.errors.export_error'));
      addNotification({ message: msg, type: 'error' });
    } finally {
      setExportingTournamentId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    if (deleteNameInput.trim() !== deleteTarget.name) {
      addNotification({ message: t('tournaments.wizard.delete_name_invalid'), type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      await DatabaseService.deleteTournament(deleteTarget.id);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteNameInput('');
      loadTournaments();
    } catch (error) {
      console.error('Error deleting tournament:', error);
      addNotification({
        message: formatUserError(error, t('common.delete_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Tournament>[] = [
    {
      key: 'name',
      header: t('common.name'),
      render: (tournament) => `${tournament.place_name ?? '?'} - ${tournament.name}`,
    },
    {
      key: 'type',
      header: t('common.type'),
      render: (tournament) =>
        tournament.type === 'circuit'
          ? t('tournaments.types.circuit')
          : t('tournaments.types.qualifier'),
    },
    {
      key: 'circuit_name',
      header: t('common.circuit'),
      render: (tournament) => (tournament as any).circuit_name || '-',
    },
    {
      key: 'date',
      header: t('common.date'),
      render: (tournament) => formatDateForDisplay(tournament.date),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (tournament) => {
        const statusMap: Record<string, string> = {
          draft: t('tournaments.statuses.draft'),
          in_progress: t('tournaments.statuses.in_progress'),
          completed: t('tournaments.statuses.completed'),
        };
        return statusMap[tournament.status] || tournament.status;
      },
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (tournament) => (
        <div className="flex items-center gap-2">
          <IconActionButton
            label={t('common.view')}
            variant="primary"
            onClick={() => handleViewTournament(tournament)}
          >
            <EyeIcon />
          </IconActionButton>
          <IconActionButton
            label={t('tournaments.export_btn')}
            variant="primary"
            onClick={() => handleExportTournament(tournament)}
            isLoading={exportingTournamentId === tournament.id}
            disabled={exportingTournamentId != null && exportingTournamentId !== tournament.id}
          >
            <ExportIcon />
          </IconActionButton>
          {!storeMode && (
            <IconActionButton
              label={t('common.delete')}
              onClick={() => handleDelete(tournament)}
              variant="danger"
            >
              <TrashIcon />
            </IconActionButton>
          )}
        </div>
      ),
    },
  ];

  const filteredByPlace =
    selectedPlaceIds.length > 0
      ? tournaments.filter((t) => t.place_id != null && selectedPlaceIds.includes(t.place_id))
      : tournaments;

  const filteredTournaments = filterTournamentsForStoreKiosk(
    searchTerm.trim()
      ? filteredByPlace.filter((t) => {
          const term = searchTerm.toLowerCase();
          const name = (t.name ?? '').toLowerCase();
          const placeName = (t.place_name ?? '').toLowerCase();
          return name.includes(term) || placeName.includes(term);
        })
      : filteredByPlace
  );

  const getWizardTitle = () => {
    switch (wizardStep) {
      case 'quick':
        return t('tournaments.wizard.quick_title');
      case 'form':
        return t('tournaments.wizard.step1');
      case 'config':
        return t('tournaments.wizard.step2');
      case 'registration':
        return t('tournaments.wizard.step3');
      default:
        return t('tournaments.new');
    }
  };

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('tournaments.title')}</h1>
          {storeMode ? (
            canCreateStoreTournament(tournaments) && (
              <Button onClick={() => handleCreateTournament('quick')}>
                {t('tournaments.quick_tournament')}
              </Button>
            )
          ) : (
            <div className="flex space-x-2">
              <Button variant="secondary" onClick={() => handleCreateTournament('quick')}>
                {t('tournaments.quick_tournament')}
              </Button>
              <Button onClick={() => handleCreateTournament('advanced')}>
                {t('tournaments.new')}
              </Button>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <Input
              placeholder={t('tournaments.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {!storeMode && places.length > 0 && (
            <MultiSelect
              label={t('tournaments.filter_place')}
              options={places.map((p) => ({ value: p.id!, label: p.name }))}
              value={selectedPlaceIds}
              onChange={(v) => setSelectedPlaceIds(v as number[])}
              placeholder={t('tournaments.all_places')}
              className="max-w-xs"
            />
          )}
        </div>

        {isLoading && tournaments.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        ) : (
          <Table
            columns={columns}
            data={filteredTournaments}
            keyExtractor={(tournament) => tournament.id || Math.random()}
            emptyMessage={t('tournaments.empty_msg')}
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCancelWizard}
        title={getWizardTitle()}
        size={wizardStep === 'quick' ? 'xl' : 'lg'}
        footer={
          wizardStep === 'form' ? (
            <>
              <Button variant="secondary" onClick={handleCancelWizard}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => formRef.current?.submit()}>{t('common.continue')}</Button>
            </>
          ) : wizardStep === 'config' ? (
            <Button variant="secondary" onClick={handleCancelWizard}>
              {t('common.cancel')}
            </Button>
          ) : undefined
        }
      >
        {wizardStep === 'quick' && (
          <QuickTournamentWizard
            onCancel={handleCancelWizard}
            onComplete={handleQuickComplete}
            onCompleteAndAnother={handleQuickCompleteAndAnother}
          />
        )}

        {wizardStep === 'form' && (
          <TournamentForm
            ref={formRef}
            onSave={handleFormSubmit}
            onCancel={handleCancelWizard}
            mode={mode}
            hideActions
          />
        )}

        {wizardStep === 'config' && tournamentDraft && (
          <TournamentConfigComponent
            tournamentId={0}
            playersPerMatch={tournamentDraft.players_per_match || 2}
            showKnockoutOptions={tournamentDraft.competition_format === 'swiss_knockout'}
            onSave={handleConfigSubmit}
            onCancel={() => setWizardStep('form')}
          />
        )}

        {wizardStep === 'registration' && tournamentDraft && mode === 'advanced' && (
          <PlayerRegistration
            tournamentId={null}
            draftPlayers={registrationPlayers}
            onDraftPlayersChange={setRegistrationPlayers}
            onComplete={handleRegistrationComplete}
            onCancel={handleCancelWizard}
            mode="advanced"
          />
        )}
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (isLoading) return;
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
          setDeleteNameInput('');
        }}
        title={t('common.delete')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteTarget(null);
                setDeleteNameInput('');
              }}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} isLoading={isLoading}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {deleteTarget
              ? t('tournaments.wizard.delete_confirm', { name: deleteTarget.name })
              : t('common.loading')}
          </p>
          <Input
            label={t('tournaments.wizard.delete_enter_name', { name: deleteTarget?.name ?? '' })}
            value={deleteNameInput}
            onChange={(e) => setDeleteNameInput(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
