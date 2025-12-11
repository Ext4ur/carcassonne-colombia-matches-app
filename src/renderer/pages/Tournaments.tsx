import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { Tournament, TournamentConfig } from '../types/tournament';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import TournamentForm from '../components/tournament/TournamentForm';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import PlayerRegistration from '../components/tournament/PlayerRegistration';
import { Column } from '../components/common/Table';

type WizardStep = 'form' | 'config' | 'registration' | null;

export default function Tournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(null);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'quick' | 'advanced'>('quick');

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
    setCurrentTournament(null);
    setWizardStep('form');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (tournamentData: Partial<Tournament>) => {
    try {
      setIsLoading(true);
      
      // Calculate number of rounds if not provided
      let numberOfRounds = tournamentData.number_of_rounds;
      if (!numberOfRounds && mode === 'quick') {
        // For quick mode, we'll calculate it after players are registered
        numberOfRounds = undefined;
      }
      
      const tournamentId = await DatabaseService.createTournament({
        name: tournamentData.name!,
        type: tournamentData.type!,
        circuit_id: tournamentData.circuit_id,
        date: tournamentData.date!,
        players_per_match: tournamentData.players_per_match || 2,
        number_of_rounds: numberOfRounds,
      });

      const tournament = await DatabaseService.getTournamentById(tournamentId);
      setCurrentTournament(tournament as Tournament);

      if (mode === 'quick') {
        // Quick mode: use defaults and go to registration
        await DatabaseService.createTournamentConfig({
          tournament_id: tournamentId,
          avoid_rematches: true,
          tiebreak_criteria: DEFAULT_TIEBREAK_CRITERIA,
          scoring_system: getDefaultScoringSystem(tournamentData.players_per_match || 2),
          bye_selection: 'worst',
        });
        setWizardStep('registration');
      } else {
        // Advanced mode: go to config
        setWizardStep('config');
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      alert('Error al crear el torneo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigSubmit = async (configData: Partial<TournamentConfig> & { bye_selection?: 'worst' | 'random' | 'round_robin' }) => {
    try {
      setIsLoading(true);
      await DatabaseService.createTournamentConfig({
        tournament_id: currentTournament!.id!,
        avoid_rematches: configData.avoid_rematches ?? true,
        tiebreak_criteria: configData.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA,
        scoring_system: configData.scoring_system || getDefaultScoringSystem(currentTournament!.players_per_match),
        bye_selection: configData.bye_selection || 'worst',
      });
      setWizardStep('registration');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Error al guardar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationComplete = () => {
    setIsModalOpen(false);
    setWizardStep(null);
    setCurrentTournament(null);
    loadTournaments();
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
      render: (tournament) => new Date(tournament.date).toLocaleDateString(),
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
          <p className="text-center py-8 text-gray-500">Cargando...</p>
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
        onClose={() => {
          if (confirm('¿Estás seguro de cancelar? Se perderán los datos no guardados.')) {
            setIsModalOpen(false);
            setWizardStep(null);
            setCurrentTournament(null);
          }
        }}
        title={getWizardTitle()}
        size="lg"
      >
        {wizardStep === 'form' && (
          <TournamentForm
            onSave={handleFormSubmit}
            onCancel={() => {
              setIsModalOpen(false);
              setWizardStep(null);
            }}
            mode={mode}
          />
        )}

        {wizardStep === 'config' && currentTournament && (
          <TournamentConfigComponent
            tournamentId={currentTournament.id!}
            playersPerMatch={currentTournament.players_per_match}
            onSave={handleConfigSubmit}
            onCancel={() => setWizardStep('form')}
          />
        )}

        {wizardStep === 'registration' && currentTournament && (
          <PlayerRegistration
            tournamentId={currentTournament.id!}
            onComplete={handleRegistrationComplete}
          />
        )}
      </Modal>
    </div>
  );
}
