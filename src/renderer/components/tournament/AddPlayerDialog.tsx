/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Modal from '../common/Modal';
import Button from '../common/Button';
import PlayerSearch from '../common/PlayerSearch';
import Input from '../common/Input';

import { useTranslation } from 'react-i18next';
import { calculateNumberOfRounds } from '../../utils/tournament';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatUserError } from '../../utils/formatUserError';

interface AddPlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayerAdded: () => void;
  tournamentId: number;
  existingPlayerIds: number[];
  currentRoundsVal: number;
  isUnstarted: boolean;
}

export default function AddPlayerDialog({
  isOpen,
  onClose,
  onPlayerAdded,
  tournamentId,
  existingPlayerIds,
  currentRoundsVal,
  isUnstarted,
}: AddPlayerDialogProps) {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [isNewPlayerMode, setIsNewPlayerMode] = useState(false);
  const [newPlayerData, setNewPlayerData] = useState({
    name: '',
    bga_username: '',
    phone: '',
    email: '',
    age: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  // Common registration logic that evaluates the round thresholds
  const processPlayerRegistration = async (playerId: number): Promise<boolean> => {
    const newPlayerCount = existingPlayerIds.length + 1;
    const newCalculatedRounds = calculateNumberOfRounds(newPlayerCount);

    let shouldUpdateRounds = false;

    if (newCalculatedRounds > currentRoundsVal) {
      if (isUnstarted) {
        if (
          !confirm(
            t('tournaments.registration.rounds_increase_confirm', { rounds: newCalculatedRounds })
          )
        ) {
          return false;
        }
        shouldUpdateRounds = true;
      } else {
        if (
          !confirm(
            t('tournaments.registration.rounds_bracket_warning', { rounds: newCalculatedRounds })
          )
        ) {
          return false;
        }
        shouldUpdateRounds = true;
      }
    }

    await DatabaseService.registerPlayerToTournament(tournamentId, playerId);
    if (shouldUpdateRounds) {
      await DatabaseService.updateTournament(tournamentId, {
        number_of_rounds: newCalculatedRounds,
      });
    }

    return true;
  };

  const handleSelectPlayer = async (player: Player) => {
    if (!player.id) return;
    try {
      setIsLoading(true);
      const success = await processPlayerRegistration(player.id);
      if (success) {
        onPlayerAdded();
        onClose();
      }
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        addNotification({
          message: t('tournaments.registration.already_registered'),
          type: 'warning',
        });
      } else {
        console.error('Error adding player:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.registration.register_error')),
          type: 'error',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlayerData.name.trim()) {
      addNotification({ message: t('tournaments.form.name_req'), type: 'warning' });
      return;
    }
    try {
      setIsLoading(true);
      const playerId = await DatabaseService.createPlayer({
        name: newPlayerData.name.trim(),
        bga_username: newPlayerData.bga_username.trim() || undefined,
        phone: newPlayerData.phone.trim() || undefined,
        email: newPlayerData.email.trim() || undefined,
        age: newPlayerData.age ? Number(newPlayerData.age) : undefined,
      });

      const success = await processPlayerRegistration(playerId);
      if (success) {
        onPlayerAdded();
        onClose();
        setNewPlayerData({ name: '', bga_username: '', phone: '', email: '', age: '' });
        setIsNewPlayerMode(false);
      }
    } catch (error) {
      console.error('Error creating player:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.registration.create_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tournaments.registration.add_player_title')}
      footer={
        isNewPlayerMode ? (
          <>
            <Button variant="secondary" onClick={() => setIsNewPlayerMode(false)}>
              {t('tournaments.registration.back_to_search')}
            </Button>
            <Button onClick={handleCreateAndAdd} isLoading={isLoading}>
              {t('tournaments.registration.create_and_enroll')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        )
      }
    >
      {isNewPlayerMode ? (
        <div className="space-y-4">
          <Input
            label={t('players.form.name')}
            value={newPlayerData.name}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, name: e.target.value })}
            required
          />
          <Input
            label={t('players.form.bga_username')}
            value={newPlayerData.bga_username}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, bga_username: e.target.value })}
          />
          <Input
            label={t('players.form.phone')}
            type="tel"
            value={newPlayerData.phone}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, phone: e.target.value })}
          />
          <Input
            label={t('players.form.email')}
            type="email"
            value={newPlayerData.email}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, email: e.target.value })}
          />
          <Input
            label={t('players.form.age')}
            type="number"
            value={newPlayerData.age}
            onChange={(e) => setNewPlayerData({ ...newPlayerData, age: e.target.value })}
          />
        </div>
      ) : (
        <div className="space-y-4 min-h-[300px]">
          <div className="flex justify-between items-center">
            <p className="text-gray-600 dark:text-gray-400">
              {t('tournaments.registration.search_existing')}
            </p>
            <Button size="sm" onClick={() => setIsNewPlayerMode(true)}>
              {t('tournaments.registration.create_new')}
            </Button>
          </div>
          <PlayerSearch
            onSelect={handleSelectPlayer}
            excludeIds={existingPlayerIds}
            placeholder={t('tournaments.registration.search_placeholder')}
          />
        </div>
      )}
    </Modal>
  );
}
