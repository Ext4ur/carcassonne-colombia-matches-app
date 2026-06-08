import type { PlayerStanding, TiebreakCriterion } from '../types/tournament';
import { getEffectiveTiebreakCriteria } from '../constants';
import { formatPlayerStandingHeadToHeadText } from './headToHeadDisplay';

export type ExportTranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Criterios habilitados para columnas de export (la hoja ya incluye victorias). */
export function getStandingsExportTiebreakColumns(
  criteria: TiebreakCriterion[] | null | undefined
): TiebreakCriterion[] {
  const effective = getEffectiveTiebreakCriteria(criteria);
  return [...effective]
    .filter((c) => c.enabled && c.id !== 'wins')
    .sort((a, b) => a.order - b.order);
}

export function tiebreakHeaderForExport(
  criterion: TiebreakCriterion,
  t: ExportTranslateFn
): string {
  return t(`tiebreaks_short.${criterion.id}`, { defaultValue: criterion.name });
}

/** Misma lógica numérica / H2H que la tabla de clasificación en torneo. */
export function formatStandingTiebreakForExport(
  standing: PlayerStanding,
  criterionId: string,
  t: ExportTranslateFn
): string {
  if (criterionId === 'head_to_head') {
    return formatPlayerStandingHeadToHeadText(standing, (key, opts) =>
      t(key, opts as Record<string, unknown>)
    );
  }

  const value = standing.tiebreak_values[criterionId];
  if (value === undefined || value === null) return '';

  if (criterionId === 'wins') {
    return value.toString();
  }
  if (
    criterionId === 'opponent_points_drop_worst' ||
    criterionId === 'opponent_points_drop_best_worst'
  ) {
    return Number(value.toFixed(2)).toString();
  }
  if (criterionId === 'point_difference') {
    return value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);
  }
  return value.toString();
}
