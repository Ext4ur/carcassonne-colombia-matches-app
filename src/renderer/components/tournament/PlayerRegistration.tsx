/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Table from '../common/Table';
import Button from '../common/Button';
import Modal from '../common/Modal';
import PlayerSearch from '../common/PlayerSearch';
import Input from '../common/Input';
import { Column } from '../common/Table';
import { calculateNumberOfRounds } from '../../utils/tournament';
import RoundsConfirmationModal from './RoundsConfirmationModal';
import { useTranslation } from 'react-i18next';

type RoundsConfirmAction = 'complete' | 'completeAndAnother';

interface PlayerRegistrationProps {
  /** When null, draft mode: players come from draftPlayers/onDraftPlayersChange (no DB writes until parent creates tournament). */
  tournamentId: number | null;
  onComplete: (numberOfRounds: number) => void;
  /** Quick wizard: create tournament and reset form for another without navigating away. */
  onCompleteAndAnother?: (numberOfRounds: number) => void;
  onCancel?: () => void;
  mode?: 'quick' | 'advanced';
  /** Required when tournamentId is null (draft mode). */
  draftPlayers?: Player[];
  onDraftPlayersChange?: (players: Player[]) => void;
}

export default function PlayerRegistration({
  tournamentId,
  onComplete,
  onCompleteAndAnother,
  onCancel,
  mode = 'quick',
  draftPlayers = [],
  onDraftPlayersChange,
}: PlayerRegistrationProps) {
  const { t } = useTranslation();
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

  const isDraftMode = tournamentId === null;
  const players = isDraftMode ? draftPlayers : dbPlayers;

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setIsLoading(true);
      const data = await DatabaseService.getTournamentPlayers(tournamentId);
      setDbPlayers(data);
    } catch (error) {
      console.error('Error loading tournament players:', error);
      alert(t('tournaments.registration.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId, t]);

  useEffect(() => {
    if (!isDraftMode && tournamentId) {
      loadPlayers();
    }
  }, [tournamentId, isDraftMode, loadPlayers]);

  useEffect(() => {
    if (players.length >= 2) {
      const rounds = calculateNumberOfRounds(players.length);
      setCalculatedRounds(rounds);
    } else {
      setCalculatedRounds(1);
    }
  }, [players.length]);

  const handleSelectPlayer = async (player: Player) => {
    if (!player.id) return;
    if (isDraftMode) {
      if (draftPlayers.some((p) => p.id === player.id)) {
        alert(t('tournaments.registration.already_in_list'));
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
        alert(t('tournaments.registration.already_registered'));
      } else {
        console.error('Error registering player:', error);
        alert(t('tournaments.registration.register_error'));
      }
    }
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
      alert(t('tournaments.registration.remove_error'));
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlayerData.name.trim()) {
      alert(t('tournaments.form.name_req'));
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
      alert(t('tournaments.registration.create_error'));
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

  const registeredIds = players.map((p) => p.id!).filter((id): id is number => id !== undefined);

  return (
    <div className="flex flex-col overflow-hidden gap-4">
      {/* Search section: always on top so dropdown appears above table headers (AC-008) */}
      <div className="flex-none relative z-[100] overflow-visible">
        <h3 className="text-lg font-medium mb-4">{t('tournaments.registration.title')}</h3>
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
      </div>

      {/* Table section: fixed max height so only this area scrolls, modal stays same size */}
      <div className="flex-none flex flex-col overflow-hidden relative z-0 min-h-0">
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
        <div className="max-h-[40vh] min-h-[120px] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
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

      {/* Buttons: Cancel and Continuar in same row, Continuar disabled when < 2 players */}
      <div className="flex-none flex justify-end items-center gap-2 pt-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        {onCompleteAndAnother && (
          <Button
            onClick={() => {
              setRoundsConfirmAction('completeAndAnother');
              setIsRoundsModalOpen(true);
            }}
            variant="secondary"
            disabled={players.length < 2}
          >
            {t('tournaments.wizard.create_and_another')}
          </Button>
        )}
        <Button
          onClick={() => {
            setRoundsConfirmAction('complete');
            setIsRoundsModalOpen(true);
          }}
          variant="primary"
          disabled={players.length < 2}
        >
          {t('tournaments.registration.continue_with_count', { count: players.length })}
        </Button>
      </div>

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
