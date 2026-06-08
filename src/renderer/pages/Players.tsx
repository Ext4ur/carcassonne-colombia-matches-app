import { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';
import { DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE } from '../constants/deleteGuards';

export default function Players() {
  const { t } = useTranslation();
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
    display_preference: 'name' as 'name' | 'username',
    phone: '',
    email: '',
    age: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [selectedPlayersForH2H, setSelectedPlayersForH2H] = useState<{
    player1: Player;
    player2: Player;
  } | null>(null);
  const [opponents, setOpponents] = useState<
    Array<{ player: Player; matches: number; wins: number; losses: number }>
  >([]);
  const [selectedPlayerForOpponents, setSelectedPlayerForOpponents] = useState<Player | null>(null);

  const loadPlayers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllPlayers();
      setPlayers(data);
      setFilteredPlayers(data);
    } catch (error) {
      console.error('Error loading players:', error);
      addNotification({
        message: t('players.errors.load'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

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

  const handleOpenModal = (player?: Player) => {
    if (player) {
      setEditingPlayer(player);
      setFormData({
        name: player.name || '',
        bga_username: player.bga_username || '',
        display_preference: player.display_preference ?? 'name',
        phone: player.phone || '',
        email: player.email || '',
        age: player.age?.toString() || '',
      });
    } else {
      setEditingPlayer(null);
      setFormData({
        name: '',
        bga_username: '',
        display_preference: 'name',
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
      display_preference: 'name',
      phone: '',
      email: '',
      age: '',
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('players.errors.name_required');
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('players.errors.email_invalid');
    }

    if (
      formData.age &&
      (isNaN(Number(formData.age)) || Number(formData.age) < 0 || Number(formData.age) > 150)
    ) {
      newErrors.age = t('players.errors.age_invalid');
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
          display_preference: formData.display_preference,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          age: formData.age ? Number(formData.age) : undefined,
        });
      } else {
        await DatabaseService.createPlayer({
          name: formData.name.trim(),
          bga_username: formData.bga_username.trim() || undefined,
          display_preference: formData.display_preference,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          age: formData.age ? Number(formData.age) : undefined,
        });
      }
      handleCloseModal();
      loadPlayers();
      addNotification({
        message: editingPlayer
          ? t('players.errors.save_success')
          : t('players.errors.create_success'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error saving player:', error);
      addNotification({
        message: t('players.errors.save'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (player: Player) => {
    if (!player.id) return;
    if (!confirm(t('players.alerts.delete_confirm', { name: player.name }))) return;

    try {
      setIsLoading(true);
      await DatabaseService.deletePlayer(player.id);
      loadPlayers();
      addNotification({
        message: t('players.errors.delete_success'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error deleting player:', error);
      const err = error as Error;
      const msg = err.message || '';
      const errorMessage =
        msg === DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE ||
        msg.includes('No se puede eliminar') ||
        msg.includes('ha participado')
          ? msg
          : t('players.errors.delete');

      addNotification({
        message: errorMessage,
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
        message: t('players.errors.load_opponents'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Player>[] = [
    {
      key: 'name',
      header: t('players.columns.name'),
    },
    {
      key: 'bga_username',
      header: t('players.columns.bga_username'),
      render: (player) => player.bga_username || '-',
    },
    {
      key: 'phone',
      header: t('players.columns.phone'),
      render: (player) => player.phone || '-',
    },
    {
      key: 'email',
      header: t('players.columns.email'),
      render: (player) => player.email || '-',
    },
    {
      key: 'age',
      header: t('players.columns.age'),
      render: (player) => player.age || '-',
    },
    {
      key: 'actions',
      header: t('players.columns.actions'),
      render: (player) => (
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedPlayerForStats(player)}
            title={t('players.actions.view_stats')}
          >
            {t('players.actions.view_stats_icon') || '📊'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleViewOpponents(player)}
            title={t('players.actions.view_opponents')}
          >
            {t('players.actions.view_opponents_icon') || '👥'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(player)}>
            {t('players.actions.edit')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(player)}>
            {t('players.actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('players.title')}</h1>
          <Button onClick={() => handleOpenModal()}>{t('players.new')}</Button>
        </div>

        <div className="mb-4">
          <Input
            type="text"
            placeholder={t('players.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isLoading && players.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('players.loading')}
          </p>
        ) : (
          <Table
            columns={columns}
            data={filteredPlayers}
            keyExtractor={(player) => player.id || Math.random()}
            emptyMessage={t('players.empty_msg')}
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingPlayer ? t('players.modal.edit') : t('players.modal.new')}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('players.modal.cancel_btn')}
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingPlayer ? t('players.modal.update_btn') : t('players.modal.create_btn')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('players.form.name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />
          <Input
            label={t('players.form.bga_username')}
            value={formData.bga_username}
            onChange={(e) => setFormData({ ...formData, bga_username: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('players.form.display_preference')}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t('players.form.display_preference_help')}
            </p>
            <div className="flex gap-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="display_preference"
                  checked={formData.display_preference === 'name'}
                  onChange={() => setFormData({ ...formData, display_preference: 'name' })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-gray-200">
                  {t('players.form.display_name')}
                </span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="display_preference"
                  checked={formData.display_preference === 'username'}
                  onChange={() => setFormData({ ...formData, display_preference: 'username' })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-gray-200">
                  {t('players.form.display_username')}
                </span>
              </label>
            </div>
          </div>
          <Input
            label={t('players.form.phone')}
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <Input
            label={t('players.form.email')}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={errors.email}
          />
          <Input
            label={t('players.form.age')}
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
          title={t('players.stats_modal.title', { name: selectedPlayerForStats.name })}
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
          title={t('players.opponents_modal.title', { name: selectedPlayerForOpponents.name })}
          size="lg"
        >
          <div className="space-y-4">
            {opponents.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                {t('players.opponents_modal.empty_msg')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.opponents_modal.cols.player')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.opponents_modal.cols.matches')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.opponents_modal.cols.wins')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.opponents_modal.cols.losses')}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('players.opponents_modal.cols.actions')}
                      </th>
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
                            {t('players.actions.view_history')}
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
