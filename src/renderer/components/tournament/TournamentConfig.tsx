import { useState, useEffect } from 'react';
import { TournamentConfig, TiebreakCriterion, ScoringSystem } from '../../types/tournament';
import { getDefaultScoringSystem } from '../../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../../utils/tiebreak';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

interface TournamentConfigProps {
  tournamentId: number;
  playersPerMatch: number;
  config?: TournamentConfig;
  onSave: (config: Partial<TournamentConfig> & { bye_selection?: 'worst' | 'random' | 'round_robin' }) => void;
  onCancel: () => void;
}

export default function TournamentConfigComponent({
  tournamentId,
  playersPerMatch,
  config,
  onSave,
  onCancel,
}: TournamentConfigProps) {
  const [tiebreakCriteria, setTiebreakCriteria] = useState<TiebreakCriterion[]>(
    config?.tiebreak_criteria || DEFAULT_TIEBREAK_CRITERIA
  );
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>(
    config?.scoring_system || getDefaultScoringSystem(playersPerMatch)
  );
  const [avoidRematches, setAvoidRematches] = useState(config?.avoid_rematches ?? true);
  const [byeSelection, setByeSelection] = useState<'worst' | 'random' | 'round_robin'>('worst');

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(tiebreakCriteria);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order
    const updated = items.map((item, index) => ({
      ...item,
      order: index + 1,
    }));

    setTiebreakCriteria(updated);
  };

  const toggleCriterion = (id: string) => {
    setTiebreakCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const updateScoring = (position: number, value: string) => {
    const numValue = value === '' ? 0 : Number(value);
    setScoringSystem((prev) => ({
      ...prev,
      [position]: numValue,
    }));
  };

  const handleSubmit = () => {
    onSave({
      tournament_id: tournamentId,
      avoid_rematches: avoidRematches,
      tiebreak_criteria: tiebreakCriteria,
      scoring_system: scoringSystem,
      bye_selection: byeSelection,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={avoidRematches}
              onChange={(e) => setAvoidRematches(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Evitar que un par de oponentes se enfrente 2 veces
            </span>
          </label>
        </div>

        <div>
          <Select
            label="Selección de Bye (cuando hay número impar de jugadores)"
            value={byeSelection}
            onChange={(e) => setByeSelection(e.target.value as 'worst' | 'random' | 'round_robin')}
            options={[
              { value: 'worst', label: 'Peor jugador de la ronda (por defecto)' },
              { value: 'random', label: 'Aleatorio' },
              { value: 'round_robin', label: 'Round-robin (cada jugador máximo 1 bye)' },
            ]}
            helperText="El jugador que recibe el bye gana automáticamente la partida"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">Criterios de Desempate</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Arrastra para reordenar. Desmarca para desactivar un criterio.
        </p>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="tiebreak-criteria">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {tiebreakCriteria.map((criterion, index) => (
                  <Draggable key={criterion.id} draggableId={criterion.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${
                          snapshot.isDragging ? 'shadow-lg' : ''
                        }`}
                      >
                        <div {...provided.dragHandleProps} className="cursor-move">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                        <input
                          type="checkbox"
                          checked={criterion.enabled}
                          onChange={() => toggleCriterion(criterion.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="flex-1 text-sm">{criterion.name}</span>
                        <span className="text-xs text-gray-500">#{criterion.order}</span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">Sistema de Puntuación</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Puntos del torneo según la posición en cada partida
        </p>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].slice(0, playersPerMatch).map((position) => (
            <Input
              key={position}
              label={`Posición ${position}`}
              type="number"
              value={scoringSystem[position]?.toString() || '0'}
              onChange={(e) => updateScoring(position, e.target.value)}
              min="0"
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit}>
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}

