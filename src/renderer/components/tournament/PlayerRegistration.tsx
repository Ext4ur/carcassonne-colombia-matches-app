/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Table from '../common/Table';
import Button from '../common/Button';
import Modal from '../common/Modal';
import PlayerSearch from '../common/PlayerSearch';
import PlayerPicker from './PlayerPicker';
import Input from '../common/Input';
import { Column } from '../common/Table';
import { calculateNumberOfRounds } from '../../utils/tournament';
import RoundsConfirmationModal from './RoundsConfirmationModal';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatUserError } from '../../utils/formatUserError';

type RoundsConfirmAction = 'complete' | 'completeAndAnother';

export interface PlayerRegistrationRef {
  requestComplete: () => void;
  requestCompleteAndAnother: () => void;
}

interface PlayerRegistrationProps {
  /** When null, draft mode: players come from draftPlayers/onDraftPlayersChange (no DB writes until parent creates tournament). */
  tournamentId: number | null;
  onComplete: (numberOfRounds: number) => void;
  /** Quick wizard: create tournament and reset form for another without navigating away. */
  onCompleteAndAnother?: (numberOfRounds: number) => void;
  onCancel?: () => void;
  mode?: 'quick' | 'advanced';
  layout?: 'stacked' | 'panel';
  /** Required when tournamentId is null (draft mode). */
  draftPlayers?: Player[];
  onDraftPlayersChange?: (players: Player[]) => void;
}

const PlayerRegistration = forwardRef<PlayerRegistrationRef, PlayerRegistrationProps>(
  function PlayerRegistration(
    {
      tournamentId,
      onComplete,
      onCompleteAndAnother,
      onCancel,
      mode = 'quick',
      layout = 'stacked',
      draftPlayers = [],
      onDraftPlayersChange,
    },
    ref
  ) {
    const { t } = useTranslation();
    const { addNotification } = useNotifications();
    const [dbPlayers, setDbPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isNewPlayerModalOpen, setIsNewPlayerModalOpen] = useState(false);
    const [isRoundsModalOpen, setIsRoundsModalOpen] = useState(false);
    const [roundsConfirmAction, setRoundsConfirmAction] = useState<RoundsConfirmAction>('complete');
    const [calculatedRounds, setCalculatedRounds] = useState(1);
    const [newPlayerData, setNewPlayerData] = useState({
      name: '',
      bga_username: '',
      phone: '',
      email: '',
      age: '',
    });
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [isLoadingAllPlayers, setIsLoadingAllPlayers] = useState(false);

    const isDraftMode = tournamentId === null;
    const players = isDraftMode ? draftPlayers : dbPlayers;
    const usePlayerPicker = mode === 'quick' && isDraftMode;
    const isPanelLayout = layout === 'panel';

    const loadPlayers = useCallback(async () => {
      if (!tournamentId) return;
      try {
        setIsLoading(true);
        const data = await DatabaseService.getTournamentPlayers(tournamentId);
        setDbPlayers(data);
      } catch (error) {
        console.error('Error loading tournament players:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.registration.load_error')),
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    }, [tournamentId, t, addNotification]);

    useEffect(() => {
      if (!isDraftMode && tournamentId) {
        loadPlayers();
      }
    }, [tournamentId, isDraftMode, loadPlayers]);

    useEffect(() => {
      if (!usePlayerPicker) return;
      let cancelled = false;
      (async () => {
        try {
          setIsLoadingAllPlayers(true);
          const data = await DatabaseService.getAllPlayers();
          if (!cancelled) setAllPlayers(data);
        } catch (error) {
          console.error('Error loading all players:', error);
          if (!cancelled) {
            addNotification({
              message: formatUserError(error, t('tournaments.registration.load_error')),
              type: 'error',
            });
          }
        } finally {
          if (!cancelled) setIsLoadingAllPlayers(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [usePlayerPicker, t, addNotification]);

    useEffect(() => {
      if (players.length >= 2) {
        const rounds = calculateNumberOfRounds(players.length);
        setCalculatedRounds(rounds);
      } else {
        setCalculatedRounds(1);
      }
    }, [players.length]);

    const registeredIds = players.map((p) => p.id!).filter((id): id is number => id !== undefined);

    const openRoundsModal = (action: RoundsConfirmAction) => {
      setRoundsConfirmAction(action);
      setIsRoundsModalOpen(true);
    };

    useImperativeHandle(ref, () => ({
      requestComplete: () => openRoundsModal('complete'),
      requestCompleteAndAnother: () => openRoundsModal('completeAndAnother'),
    }));

    const handleSelectPlayer = async (player: Player) => {
      if (!player.id) return;
      if (isDraftMode) {
        if (draftPlayers.some((p) => p.id === player.id)) {
          addNotification({
            message: t('tournaments.registration.already_in_list'),
            type: 'warning',
          });
          return;
        }
        onDraftPlayersChange?.([...draftPlayers, player]);
        return;
      }
      try {
        await DatabaseService.registerPlayerToTournament(tournamentId, player.id);
        loadPlayers();
      } catch (error: any) {
        if (error.message?.includes('UNIQUE constraint')) {
          addNotification({
            message: t('tournaments.registration.already_registered'),
            type: 'warning',
          });
        } else {
          console.error('Error registering player:', error);
          addNotification({
            message: formatUserError(error, t('tournaments.registration.register_error')),
            type: 'error',
          });
        }
      }
    };

    const handlePickerRegister = (playerId: number) => {
      const player = allPlayers.find((p) => p.id === playerId);
      if (!player?.id) return;
      if (draftPlayers.some((p) => p.id === player.id)) return;
      onDraftPlayersChange?.([...draftPlayers, player]);
    };

    const handlePickerUnregister = (playerId: number) => {
      onDraftPlayersChange?.(draftPlayers.filter((p) => p.id !== playerId));
    };

    const handleRemovePlayer = async (player: Player) => {
      if (!player.id) return;
      if (isDraftMode) {
        if (confirm(t('tournaments.registration.remove_draft_confirm', { name: player.name }))) {
          onDraftPlayersChange?.(draftPlayers.filter((p) => p.id !== player.id));
        }
        return;
      }
      if (!confirm(t('tournaments.registration.remove_confirm', { name: player.name }))) return;
      try {
        await DatabaseService.removePlayerFromTournament(tournamentId, player.id);
        loadPlayers();
      } catch (error) {
        console.error('Error removing player:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.registration.remove_error')),
          type: 'error',
        });
      }
    };

    const handleCreateAndAdd = async () => {
      if (!newPlayerData.name.trim()) {
        addNotification({ message: t('tournaments.form.name_req'), type: 'warning' });
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
        const newPlayer: Player = {
          id: playerId,
          name: newPlayerData.name.trim(),
          bga_username: newPlayerData.bga_username.trim() || undefined,
          phone: newPlayerData.phone.trim() || undefined,
          email: newPlayerData.email.trim() || undefined,
          age: newPlayerData.age ? Number(newPlayerData.age) : undefined,
        };
        if (isDraftMode) {
          onDraftPlayersChange?.([...draftPlayers, newPlayer]);
        } else {
          await DatabaseService.registerPlayerToTournament(tournamentId, playerId);
          loadPlayers();
        }
        setIsNewPlayerModalOpen(false);
        setNewPlayerData({ name: '', bga_username: '', phone: '', email: '', age: '' });
      } catch (error) {
        console.error('Error creating player:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.registration.create_error')),
          type: 'error',
        });
      }
    };

    const columns: Column<Player>[] = [
      {
        key: 'name',
        header: t('players.name'),
      },
      {
        key: 'bga_username',
        header: t('players.bga_username'),
        render: (player) => player.bga_username || '-',
      },
      {
        key: 'actions',
        header: t('common.actions'),
        render: (player) => (
          <Button variant="danger" size="sm" onClick={() => handleRemovePlayer(player)}>
            {t('common.delete')}
          </Button>
        ),
      },
    ];

    const pickerOptions = allPlayers
      .filter((p) => p.id != null)
      .map((p) => ({
        value: p.id!,
        label: p.name,
        bga_username: p.bga_username,
      }));

    const rootClass = isPanelLayout
      ? 'flex flex-col h-full min-h-0 gap-3 overflow-hidden'
      : 'flex flex-col overflow-hidden gap-4';

    return (
      <div className={rootClass}>
        <div className="flex-none relative z-[100] overflow-visible">
          {!isPanelLayout && (
            <h3 className="text-lg font-medium mb-4">{t('tournaments.registration.title')}</h3>
          )}
          {usePlayerPicker ? (
            <div className="flex flex-wrap items-end gap-2">
              <PlayerPicker
                className="flex-1 min-w-[200px]"
                label={isPanelLayout ? t('tournaments.registration.picker_label') : undefined}
                options={pickerOptions}
                registeredIds={registeredIds}
                onRegister={handlePickerRegister}
                onUnregister={handlePickerUnregister}
                disabled={isLoadingAllPlayers}
              />
              <Button onClick={() => setIsNewPlayerModalOpen(true)}>
                {t('tournaments.registration.new_player')}
              </Button>
            </div>
          ) : (
            <div className="flex space-x-2">
              <div className="flex-1 min-w-0 pl-2">
                <PlayerSearch
                  onSelect={handleSelectPlayer}
                  excludeIds={registeredIds}
                  placeholder={t('tournaments.registration.search_placeholder')}
                />
              </div>
              <Button onClick={() => setIsNewPlayerModalOpen(true)}>
                {t('tournaments.registration.new_player')}
              </Button>
            </div>
          )}
        </div>

        {players.length === 0 && (
          <div
            className="flex-none p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-300 dark:border-amber-700"
            role="status"
          >
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>{t('common.warning')}:</strong>{' '}
              {t('tournaments.registration.no_players_warning')}
            </p>
          </div>
        )}

        <div
          className={
            isPanelLayout
              ? 'flex-1 flex flex-col overflow-hidden relative z-0 min-h-0'
              : 'flex-none flex flex-col overflow-hidden relative z-0 min-h-0'
          }
        >
          <div className="flex justify-between items-center mb-2 flex-none">
            <h3 className="text-lg font-medium">
              {t('tournaments.registration.registered_count', { count: players.length })}
            </h3>
            {players.length >= 2 && (
              <div className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <span className="text-sm font-medium text-primary-800 dark:text-primary-200">
                  {t('tournaments.registration.calculated_rounds')}:{' '}
                  <strong>{calculatedRounds}</strong>
                </span>
              </div>
            )}
          </div>
          <div
            className={
              isPanelLayout
                ? 'flex-1 min-h-[120px] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg'
                : 'max-h-[40vh] min-h-[120px] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg'
            }
          >
            {isLoading ? (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('common.loading')}
              </p>
            ) : (
              <Table
                columns={columns}
                data={players}
                keyExtractor={(player) => player.id || Math.random()}
                emptyMessage={t('tournaments.registration.empty_msg')}
                scrollableBody
              />
            )}
          </div>
        </div>

        {!isPanelLayout && (
          <div className="flex-none flex justify-end items-center gap-2 pt-2">
            {onCancel && (
              <Button variant="secondary" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            )}
            {onCompleteAndAnother && (
              <Button onClick={() => openRoundsModal('completeAndAnother')} variant="secondary">
                {t('tournaments.wizard.create_and_another')}
              </Button>
            )}
            <Button onClick={() => openRoundsModal('complete')} variant="primary">
              {t('tournaments.registration.continue_with_count', { count: players.length })}
            </Button>
          </div>
        )}

        <RoundsConfirmationModal
          isOpen={isRoundsModalOpen}
          onClose={() => setIsRoundsModalOpen(false)}
          onConfirm={(numberOfRounds) => {
            setIsRoundsModalOpen(false);
            if (roundsConfirmAction === 'completeAndAnother' && onCompleteAndAnother) {
              onCompleteAndAnother(numberOfRounds);
            } else {
              onComplete(numberOfRounds);
            }
          }}
          numPlayers={players.length}
          calculatedRounds={calculatedRounds}
          mode={mode}
        />

        <Modal
          isOpen={isNewPlayerModalOpen}
          onClose={() => setIsNewPlayerModalOpen(false)}
          title={t('tournaments.registration.new_player')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsNewPlayerModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreateAndAdd}>
                {t('tournaments.registration.create_and_register')}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label={`${t('players.name')} *`}
              value={newPlayerData.name}
              onChange={(e) => setNewPlayerData({ ...newPlayerData, name: e.target.value })}
              required
            />
            <Input
              label={t('players.bga_username')}
              value={newPlayerData.bga_username}
              onChange={(e) => setNewPlayerData({ ...newPlayerData, bga_username: e.target.value })}
            />
            <Input
              label={t('players.phone')}
              type="tel"
              value={newPlayerData.phone}
              onChange={(e) => setNewPlayerData({ ...newPlayerData, phone: e.target.value })}
            />
            <Input
              label={t('players.email')}
              type="email"
              value={newPlayerData.email}
              onChange={(e) => setNewPlayerData({ ...newPlayerData, email: e.target.value })}
            />
            <Input
              label={t('players.age')}
              type="number"
              value={newPlayerData.age}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setNewPlayerData({ ...newPlayerData, age: '' });
                } else {
                  const numValue = parseInt(value, 10);
                  if (!isNaN(numValue) && numValue >= 0 && numValue <= 150) {
                    setNewPlayerData({ ...newPlayerData, age: value });
                  }
                }
              }}
            />
          </div>
        </Modal>
      </div>
    );
  }
);

export default PlayerRegistration;
