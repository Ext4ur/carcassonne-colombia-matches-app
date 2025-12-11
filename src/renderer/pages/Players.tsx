import { useState, useEffect } from 'react';
import { DatabaseService } from '../services/database';
import { Player } from '../types/player';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import { Column } from '../components/common/Table';
import PlayerStats from '../components/player/PlayerStats';
import HeadToHeadHistory from '../components/player/HeadToHeadHistory';
import { HeadToHeadService } from '../services/headToHead';
import { useNotifications } from '../contexts/NotificationContext';

export default function Players() {
  const { addNotification } = useNotifications();
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bga_username: '',
    phone: '',
    email: '',
    age: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [selectedPlayersForH2H, setSelectedPlayersForH2H] = useState<{ player1: Player; player2: Player } | null>(null);
  const [opponents, setOpponents] = useState<Array<{ player: Player; matches: number; wins: number; losses: number }>>([]);
  const [selectedPlayerForOpponents, setSelectedPlayerForOpponents] = useState<Player | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = players.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.bga_username && p.bga_username.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredPlayers(filtered);
    } else {
      setFilteredPlayers(players);
    }
  }, [searchTerm, players]);

  const loadPlayers = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllPlayers();
      setPlayers(data);
      setFilteredPlayers(data);
    } catch (error) {
      console.error('Error loading players:', error);
      addNotification({
        message: 'Error al cargar los jugadores',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (player?: Player) => {
    if (player) {
      setEditingPlayer(player);
      setFormData({
        name: player.name || '',
        bga_username: player.bga_username || '',
        phone: player.phone || '',
        email: player.email || '',
        age: player.age?.toString() || '',
      });
    } else {
      setEditingPlayer(null);
      setFormData({
        name: '',
        bga_username: '',
        phone: '',
        email: '',
        age: '',
      });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPlayer(null);
    setFormData({
      name: '',
      bga_username: '',
      phone: '',
      email: '',
      age: '',
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El correo electrónico no es válido';
    }

    if (formData.age && (isNaN(Number(formData.age)) || Number(formData.age) < 0 || Number(formData.age) > 150)) {
      newErrors.age = 'La edad debe ser un número válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      if (editingPlayer?.id) {
        await DatabaseService.updatePlayer(editingPlayer.id, {
          name: formData.name.trim(),
          bga_username: formData.bga_username.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          age: formData.age ? Number(formData.age) : undefined,
        });
      } else {
        await DatabaseService.createPlayer({
          name: formData.name.trim(),
          bga_username: formData.bga_username.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          age: formData.age ? Number(formData.age) : undefined,
        });
      }
      handleCloseModal();
      loadPlayers();
      addNotification({
        message: editingPlayer ? 'Jugador actualizado exitosamente' : 'Jugador creado exitosamente',
        type: 'success',
      });
    } catch (error) {
      console.error('Error saving player:', error);
      addNotification({
        message: 'Error al guardar el jugador',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (player: Player) => {
    if (!player.id) return;
    if (!confirm(`¿Estás seguro de eliminar a ${player.name}?`)) return;

    try {
      setIsLoading(true);
      await DatabaseService.deletePlayer(player.id);
      loadPlayers();
      addNotification({
        message: 'Jugador eliminado exitosamente',
        type: 'success',
      });
    } catch (error) {
      console.error('Error deleting player:', error);
      addNotification({
        message: 'Error al eliminar el jugador',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewOpponents = async (player: Player) => {
    if (!player.id) return;
    try {
      setIsLoading(true);
      const playerOpponents = await HeadToHeadService.getPlayerOpponents(player.id);
      setOpponents(playerOpponents);
      setSelectedPlayerForOpponents(player);
    } catch (error) {
      console.error('Error loading opponents:', error);
      addNotification({
        message: 'Error al cargar los oponentes',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
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
      key: 'phone',
      header: 'Teléfono',
      render: (player) => player.phone || '-',
    },
    {
      key: 'email',
      header: 'Correo',
      render: (player) => player.email || '-',
    },
    {
      key: 'age',
      header: 'Edad',
      render: (player) => player.age || '-',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (player) => (
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedPlayerForStats(player)}
            title="Ver estadísticas"
          >
            📊
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleViewOpponents(player)}
            title="Ver oponentes"
          >
            👥
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenModal(player)}
          >
            Editar
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(player)}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Jugadores</h1>
          <Button onClick={() => handleOpenModal()}>Nuevo Jugador</Button>
        </div>

        <div className="mb-4">
          <Input
            type="text"
            placeholder="Buscar por nombre o BGA username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isLoading && players.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={filteredPlayers}
            keyExtractor={(player) => player.id || Math.random()}
            emptyMessage="No hay jugadores registrados"
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingPlayer ? 'Editar Jugador' : 'Nuevo Jugador'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingPlayer ? 'Actualizar' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />
          <Input
            label="BGA Username"
            value={formData.bga_username}
            onChange={(e) => setFormData({ ...formData, bga_username: e.target.value })}
          />
          <Input
            label="Teléfono"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <Input
            label="Correo Electrónico"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={errors.email}
          />
          <Input
            label="Edad"
            type="number"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            error={errors.age}
            min="0"
            max="150"
          />
        </div>
      </Modal>

      {/* Player Stats Modal */}
      {selectedPlayerForStats && (
        <Modal
          isOpen={!!selectedPlayerForStats}
          onClose={() => setSelectedPlayerForStats(null)}
          title={`Estadísticas - ${selectedPlayerForStats.name}`}
          size="xl"
        >
          <PlayerStats
            player={selectedPlayerForStats}
            onClose={() => setSelectedPlayerForStats(null)}
          />
        </Modal>
      )}

      {/* Head to Head Modal */}
      {selectedPlayersForH2H && (
        <HeadToHeadHistory
          player1={selectedPlayersForH2H.player1}
          player2={selectedPlayersForH2H.player2}
          onClose={() => setSelectedPlayersForH2H(null)}
        />
      )}

      {/* Opponents Modal */}
      {selectedPlayerForOpponents && (
        <Modal
          isOpen={!!selectedPlayerForOpponents}
          onClose={() => {
            setSelectedPlayerForOpponents(null);
            setOpponents([]);
          }}
          title={`Oponentes - ${selectedPlayerForOpponents.name}`}
          size="lg"
        >
          <div className="space-y-4">
            {opponents.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay oponentes registrados</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Jugador</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Partidas</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Victorias</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Derrotas</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {opponents.map((opponent) => (
                      <tr key={opponent.player.id}>
                        <td className="px-4 py-2 text-sm">{opponent.player.name}</td>
                        <td className="px-4 py-2 text-sm">{opponent.matches}</td>
                        <td className="px-4 py-2 text-sm text-green-600">{opponent.wins}</td>
                        <td className="px-4 py-2 text-sm text-red-600">{opponent.losses}</td>
                        <td className="px-4 py-2 text-sm">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedPlayersForH2H({
                                player1: selectedPlayerForOpponents,
                                player2: opponent.player,
                              });
                              setSelectedPlayerForOpponents(null);
                            }}
                          >
                            Ver Historial
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
