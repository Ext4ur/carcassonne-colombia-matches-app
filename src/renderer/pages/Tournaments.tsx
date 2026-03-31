/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { Tournament, TournamentConfig } from '../types/tournament';
import { Player } from '../types/player';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import { buildQuickConfigDraft } from '../utils/quickTournamentDefaults';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import TournamentForm, { TournamentFormRef } from '../components/tournament/TournamentForm';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import PlayerRegistration from '../components/tournament/PlayerRegistration';
import MultiSelect from '../components/common/MultiSelect';
import Input from '../components/common/Input';
import { Column } from '../components/common/Table';
import { Place } from '../types/place';
import { formatDateForDisplay } from '../utils/dateUtils';
import { useNotifications } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { TOURNAMENT_LIST_DELETE_SECRET } from '../constants/deleteGuards';

type WizardStep = 'form' | 'config' | 'registration' | null;

type ConfigDraft = Partial<TournamentConfig> & {
  bye_selection?: 'worst' | 'random' | 'round_robin';
};

export default function Tournaments() {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(null);
  const [tournamentDraft, setTournamentDraft] = useState<Partial<Tournament> | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>(null);
  const [registrationPlayers, setRegistrationPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const [deleteKeyInput, setDeleteKeyInput] = useState('');
  const [mode, setMode] = useState<'quick' | 'advanced'>('quick');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const formRef = useRef<TournamentFormRef>(null);

  const loadTournaments = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllTournaments();
      setTournaments(data);
    } catch (error) {
      console.error('Error loading tournaments:', error);
      addNotification({ message: t('common.error_loading'), type: 'error' });
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

  const handleCreateTournament = (mode: 'quick' | 'advanced') => {
    setMode(mode);
    setTournamentDraft(null);
    setConfigDraft(null);
    setRegistrationPlayers([]);
    setWizardStep('form');
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
    });
    if (mode === 'quick') {
      setConfigDraft(buildQuickConfigDraft(tournamentData.players_per_match || 2) as ConfigDraft);
      setWizardStep('registration');
    } else {
      setWizardStep('config');
    }
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
    });
    setWizardStep('registration');
  };

  const handleRegistrationComplete = async (numberOfRounds: number) => {
    if (!tournamentDraft?.name || !tournamentDraft?.type || !tournamentDraft?.date) {
      addNotification({ message: t('tournaments.wizard.missing_data'), type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      const tournamentId = await DatabaseService.createTournament({
        name: tournamentDraft.name,
        type: tournamentDraft.type,
        circuit_id: tournamentDraft.circuit_id,
        date: tournamentDraft.date,
        players_per_match: tournamentDraft.players_per_match || 2,
        number_of_rounds: numberOfRounds,
        place_id: tournamentDraft.place_id,
      });
      if (configDraft) {
        await DatabaseService.createTournamentConfig({
          tournament_id: tournamentId,
          avoid_rematches: configDraft.avoid_rematches ?? true,
          tiebreak_criteria: configDraft.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
          scoring_system:
            configDraft.scoring_system ||
            getDefaultScoringSystem(tournamentDraft.players_per_match || 2),
          bye_selection: configDraft.bye_selection || 'worst',
          player_display_mode: configDraft.player_display_mode ?? 'per_player',
          pairing_algorithm: configDraft.pairing_algorithm ?? 'greedy',
          buchholz_bye_mode: configDraft.buchholz_bye_mode ?? 'legacy',
        });
      }
      for (const player of registrationPlayers) {
        if (player.id) {
          await DatabaseService.registerPlayerToTournament(tournamentId, player.id);
        }
      }
      setIsModalOpen(false);
      setWizardStep(null);
      setTournamentDraft(null);
      setConfigDraft(null);
      setRegistrationPlayers([]);
      loadTournaments();
    } catch (error) {
      console.error('Error al crear el torneo:', error);
      addNotification({ message: t('tournaments.wizard.create_error'), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewTournament = (tournament: Tournament) => {
    navigate(`/tournament/${tournament.id}`);
  };

  const handleDelete = (tournament: Tournament) => {
    setDeleteTarget(tournament);
    setDeleteKeyInput('');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    if (deleteKeyInput !== TOURNAMENT_LIST_DELETE_SECRET) {
      addNotification({ message: t('tournaments.wizard.delete_key_invalid'), type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      await DatabaseService.deleteTournament(deleteTarget.id);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteKeyInput('');
      loadTournaments();
    } catch (error) {
      console.error('Error deleting tournament:', error);
      addNotification({ message: t('common.delete_error'), type: 'error' });
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
        <div className="flex space-x-2">
          <Button variant="primary" size="sm" onClick={() => handleViewTournament(tournament)}>
            {t('common.view')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(tournament)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  const filteredByPlace =
    selectedPlaceIds.length > 0
      ? tournaments.filter((t) => t.place_id != null && selectedPlaceIds.includes(t.place_id))
      : tournaments;

  const filteredTournaments = searchTerm.trim()
    ? filteredByPlace.filter((t) => {
        const term = searchTerm.toLowerCase();
        const name = (t.name ?? '').toLowerCase();
        const placeName = (t.place_name ?? '').toLowerCase();
        return name.includes(term) || placeName.includes(term);
      })
    : filteredByPlace;

  const getWizardTitle = () => {
    switch (wizardStep) {
      case 'form':
        return mode === 'quick'
          ? t('tournaments.wizard.quick_title')
          : t('tournaments.wizard.step1');
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
          <div className="flex space-x-2">
            <Button variant="secondary" onClick={() => handleCreateTournament('quick')}>
              {t('tournaments.quick_tournament')}
            </Button>
            <Button onClick={() => handleCreateTournament('advanced')}>
              {t('tournaments.new')}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <Input
              placeholder={t('tournaments.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {places.length > 0 && (
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
        size="lg"
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
            onSave={handleConfigSubmit}
            onCancel={() => setWizardStep('form')}
          />
        )}

        {wizardStep === 'registration' && tournamentDraft && (
          <PlayerRegistration
            tournamentId={null}
            draftPlayers={registrationPlayers}
            onDraftPlayersChange={setRegistrationPlayers}
            onComplete={handleRegistrationComplete}
            onCancel={handleCancelWizard}
            mode={mode}
          />
        )}
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (isLoading) return;
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
          setDeleteKeyInput('');
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
                setDeleteKeyInput('');
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
            label={t('tournaments.wizard.delete_enter_key')}
            value={deleteKeyInput}
            onChange={(e) => setDeleteKeyInput(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
