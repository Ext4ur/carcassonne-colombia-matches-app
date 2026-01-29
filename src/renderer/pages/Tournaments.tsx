import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { Tournament, TournamentConfig } from '../types/tournament';
import { Player } from '../types/player';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import TournamentForm, { TournamentFormRef } from '../components/tournament/TournamentForm';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import PlayerRegistration from '../components/tournament/PlayerRegistration';
import { Column } from '../components/common/Table';

type WizardStep = 'form' | 'config' | 'registration' | null;

type ConfigDraft = Partial<TournamentConfig> & { bye_selection?: 'worst' | 'random' | 'round_robin' };

export default function Tournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(null);
  const [tournamentDraft, setTournamentDraft] = useState<Partial<Tournament> | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>(null);
  const [registrationPlayers, setRegistrationPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'quick' | 'advanced'>('quick');
  const formRef = useRef<TournamentFormRef>(null);

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllTournaments();
      setTournaments(data);
    } catch (error) {
      console.error('Error loading tournaments:', error);
      alert('Error al cargar los torneos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTournament = (mode: 'quick' | 'advanced') => {
    setMode(mode);
    setTournamentDraft(null);
    setConfigDraft(null);
    setRegistrationPlayers([]);
    setWizardStep('form');
    setIsModalOpen(true);
  };

  const handleCancelWizard = () => {
    if (confirm('¿Cancelar? No se creará el torneo y se perderán los datos del formulario.')) {
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
    });
    if (mode === 'quick') {
      setConfigDraft({
        avoid_rematches: true,
        tiebreak_criteria: DEFAULT_TIEBREAK_CRITERIA,
        scoring_system: getDefaultScoringSystem(tournamentData.players_per_match || 2),
        bye_selection: 'worst',
      });
      setWizardStep('registration');
    } else {
      setWizardStep('config');
    }
  };

  /** Config submit: no DB write, store draft and go to registration. */
  const handleConfigSubmit = (configData: Partial<TournamentConfig> & { bye_selection?: 'worst' | 'random' | 'round_robin'; player_display_mode?: 'per_player' | 'names_only' | 'usernames_only' }) => {
    setConfigDraft({
      avoid_rematches: configData.avoid_rematches ?? true,
      tiebreak_criteria: configData.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
      scoring_system: configData.scoring_system || getDefaultScoringSystem(tournamentDraft!.players_per_match || 2),
      bye_selection: configData.bye_selection || 'worst',
      player_display_mode: configData.player_display_mode ?? 'per_player',
    });
    setWizardStep('registration');
  };

  /** Registration complete: create tournament + config + register players (only DB writes here). */
  const handleRegistrationComplete = async (numberOfRounds: number) => {
    if (!tournamentDraft?.name || !tournamentDraft?.type || !tournamentDraft?.date) {
      alert('Faltan datos del torneo');
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
      });
      if (configDraft) {
        await DatabaseService.createTournamentConfig({
          tournament_id: tournamentId,
          avoid_rematches: configDraft.avoid_rematches ?? true,
          tiebreak_criteria: configDraft.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
          scoring_system: configDraft.scoring_system || getDefaultScoringSystem(tournamentDraft.players_per_match || 2),
          bye_selection: configDraft.bye_selection || 'worst',
          player_display_mode: configDraft.player_display_mode ?? 'per_player',
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
      alert('Error al crear el torneo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewTournament = (tournament: Tournament) => {
    navigate(`/tournament/${tournament.id}`);
  };

  const handleDelete = async (tournament: Tournament) => {
    if (!tournament.id) return;
    if (!confirm(`¿Estás seguro de eliminar el torneo "${tournament.name}"?`)) return;

    try {
      setIsLoading(true);
      await DatabaseService.deleteTournament(tournament.id);
      loadTournaments();
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert('Error al eliminar el torneo');
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Tournament>[] = [
    {
      key: 'name',
      header: 'Nombre',
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (tournament) => tournament.type === 'circuit' ? 'Circuito' : 'Clasificatorio',
    },
    {
      key: 'circuit_name',
      header: 'Circuito',
      render: (tournament) => (tournament as any).circuit_name || '-',
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (tournament) => {
        const dateStr = tournament.date.includes('T') ? tournament.date.split('T')[0] : tournament.date;
        return dateStr.split('-').reverse().join('/');
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (tournament) => {
        const statusMap: Record<string, string> = {
          draft: 'Borrador',
          in_progress: 'En Progreso',
          completed: 'Completado',
        };
        return statusMap[tournament.status] || tournament.status;
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (tournament) => (
        <div className="flex space-x-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleViewTournament(tournament)}
          >
            Ver
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(tournament)}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  const getWizardTitle = () => {
    switch (wizardStep) {
      case 'form':
        return mode === 'quick' ? 'Crear Torneo Rápido' : 'Crear Torneo - Paso 1: Información';
      case 'config':
        return 'Crear Torneo - Paso 2: Configuración';
      case 'registration':
        return 'Crear Torneo - Paso 3: Inscripción';
      default:
        return 'Crear Torneo';
    }
  };

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Torneos</h1>
          <div className="flex space-x-2">
            <Button variant="secondary" onClick={() => handleCreateTournament('quick')}>
              Torneo Rápido
            </Button>
            <Button onClick={() => handleCreateTournament('advanced')}>
              Nuevo Torneo
            </Button>
          </div>
        </div>

        {isLoading && tournaments.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={tournaments}
            keyExtractor={(tournament) => tournament.id || Math.random()}
            emptyMessage="No hay torneos registrados"
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
                Cancelar
              </Button>
              <Button onClick={() => formRef.current?.submit()}>
                Continuar
              </Button>
            </>
          ) : wizardStep === 'config' ? (
            <Button variant="secondary" onClick={handleCancelWizard}>
              Cancelar
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
    </div>
  );
}
