import { useState, useEffect } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Table from '../common/Table';
import Button from '../common/Button';
import Modal from '../common/Modal';
import PlayerSearch from '../common/PlayerSearch';
import Input from '../common/Input';
import { Column } from '../common/Table';

interface PlayerRegistrationProps {
  tournamentId: number;
  onComplete: () => void;
}

export default function PlayerRegistration({ tournamentId, onComplete }: PlayerRegistrationProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isNewPlayerModalOpen, setIsNewPlayerModalOpen] = useState(false);
  const [newPlayerData, setNewPlayerData] = useState({
    name: '',
    bga_username: '',
    phone: '',
    email: '',
    age: '',
  });

  useEffect(() => {
    loadPlayers();
  }, [tournamentId]);

  const loadPlayers = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getTournamentPlayers(tournamentId);
      setPlayers(data);
    } catch (error) {
      console.error('Error loading tournament players:', error);
      alert('Error al cargar los jugadores');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlayer = async (player: Player) => {
    try {
      if (!player.id) return;
      await DatabaseService.registerPlayerToTournament(tournamentId, player.id);
      loadPlayers();
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        alert('Este jugador ya está inscrito en el torneo');
      } else {
        console.error('Error registering player:', error);
        alert('Error al inscribir el jugador');
      }
    }
  };

  const handleRemovePlayer = async (player: Player) => {
    if (!player.id) return;
    if (!confirm(`¿Estás seguro de eliminar a ${player.name} del torneo?`)) return;

    try {
      await DatabaseService.unregisterPlayerFromTournament(tournamentId, player.id);
      loadPlayers();
    } catch (error) {
      console.error('Error removing player:', error);
      alert('Error al eliminar el jugador');
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlayerData.name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    try {
      const playerId = await DatabaseService.createPlayer({
        name: newPlayerData.name.trim(),
        bga_username: newPlayerData.bga_username.trim() || undefined,
        phone: newPlayerData.phone.trim() || undefined,
        email: newPlayerData.email.trim() || undefined,
        age: newPlayerData.age ? Number(newPlayerData.age) : undefined,
      });
      await DatabaseService.registerPlayerToTournament(tournamentId, playerId);
      setIsNewPlayerModalOpen(false);
      setNewPlayerData({
        name: '',
        bga_username: '',
        phone: '',
        email: '',
        age: '',
      });
      loadPlayers();
    } catch (error) {
      console.error('Error creating player:', error);
      alert('Error al crear el jugador');
    }
  };

  const columns: Column<Player>[] = [
    {
      key: 'name',
      header: 'Nombre',
    },
    {
      key: 'bga_username',
      header: 'BGA Username',
      render: (player) => player.bga_username || '-',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (player) => (
        <Button
          variant="danger"
          size="sm"
          onClick={() => handleRemovePlayer(player)}
        >
          Eliminar
        </Button>
      ),
    },
  ];

  const registeredIds = players.map((p) => p.id!).filter((id): id is number => id !== undefined);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-4">Inscribir Jugadores</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <PlayerSearch
              onSelect={handleSelectPlayer}
              excludeIds={registeredIds}
              placeholder="Buscar jugador existente..."
            />
          </div>
          <Button onClick={() => setIsNewPlayerModalOpen(true)}>
            Nuevo Jugador
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">
          Jugadores Inscritos ({players.length})
        </h3>
        {isLoading ? (
          <p className="text-center py-8 text-gray-500">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={players}
            keyExtractor={(player) => player.id || Math.random()}
            emptyMessage="No hay jugadores inscritos. Busca o crea un jugador para inscribirlo."
          />
        )}
      </div>

      {players.length >= 2 && (
        <div className="flex justify-end pt-4">
          <Button onClick={onComplete} variant="primary" size="lg">
            Continuar ({players.length} jugadores)
          </Button>
        </div>
      )}

      <Modal
        isOpen={isNewPlayerModalOpen}
        onClose={() => setIsNewPlayerModalOpen(false)}
        title="Nuevo Jugador"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsNewPlayerModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAndAdd}>
              Crear e Inscribir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={newPlayerData.name}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, name: e.target.value })}
            required
          />
          <Input
            label="BGA Username"
            value={newPlayerData.bga_username}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, bga_username: e.target.value })}
          />
          <Input
            label="Teléfono"
            type="tel"
            value={newPlayerData.phone}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, phone: e.target.value })}
          />
          <Input
            label="Correo Electrónico"
            type="email"
            value={newPlayerData.email}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, email: e.target.value })}
          />
          <Input
            label="Edad"
            type="number"
            value={newPlayerData.age}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, age: e.target.value })}
            min="0"
            max="150"
          />
        </div>
      </Modal>
    </div>
  );
}



