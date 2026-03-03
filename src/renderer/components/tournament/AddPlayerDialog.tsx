/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Modal from '../common/Modal';
import Button from '../common/Button';
import PlayerSearch from '../common/PlayerSearch';
import Input from '../common/Input';

import { calculateNumberOfRounds } from '../../utils/tournament';

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
            `Alcanzaste un nivel superior de jugadores. Se agregará una nueva ronda al torneo (pasarán a ser ${newCalculatedRounds}). ¿Aceptar?`
          )
        ) {
          return false;
        }
        shouldUpdateRounds = true;
      } else {
        if (
          !confirm(
            `Atención: Agregar este jugador superará el límite del bracket y forzará la generación de una ronda nueva recomendada al final (Serán ${newCalculatedRounds} rondas). No se recomienda hacer esto, y de hacerlo, procura ingresar a otra persona más (2 en total) para evitar byes. ¿Deseas arriesgarte y continuar?`
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
        alert('Este jugador ya está inscrito en el torneo');
      } else {
        console.error('Error adding player:', error);
        alert('Error al agregar el jugador');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlayerData.name.trim()) {
      alert('El nombre es requerido');
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
      alert('Error al crear el jugador');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agregar Jugador al Torneo"
      footer={
        isNewPlayerMode ? (
          <>
            <Button variant="secondary" onClick={() => setIsNewPlayerMode(false)}>
              Volver a Búsqueda
            </Button>
            <Button onClick={handleCreateAndAdd} isLoading={isLoading}>
              Crear e Inscribir
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        )
      }
    >
      {isNewPlayerMode ? (
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
          />
        </div>
      ) : (
        <div className="space-y-4 min-h-[300px]">
          <div className="flex justify-between items-center">
            <p className="text-gray-600 dark:text-gray-400">Buscar jugador existente:</p>
            <Button size="sm" onClick={() => setIsNewPlayerMode(true)}>
              Crear Nuevo Jugador
            </Button>
          </div>
          <PlayerSearch
            onSelect={handleSelectPlayer}
            excludeIds={existingPlayerIds}
            placeholder="Buscar por nombre..."
          />
        </div>
      )}
    </Modal>
  );
}
