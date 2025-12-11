import { TiebreakCriterion } from '../types/tournament';

export const DEFAULT_TIEBREAK_CRITERIA: TiebreakCriterion[] = [
  { id: 'wins', name: 'Número de victorias', enabled: true, order: 1 },
  { id: 'opponent_points_drop_worst', name: 'Suma de puntos de oponentes (quitando el peor)', enabled: true, order: 2 },
  { id: 'opponent_points_drop_best_worst', name: 'Suma de puntos de oponentes (quitando el mejor y el peor)', enabled: true, order: 3 },
  { id: 'head_to_head', name: 'Victoria en enfrentamiento directo', enabled: true, order: 4 },
  { id: 'point_difference', name: 'Suma de diferencia de puntos', enabled: true, order: 5 },
];



