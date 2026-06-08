import { createElement, type ReactNode } from 'react';
import type { PlayerStanding } from '../types/tournament';

/** Traduce claves `stats.h2h_*` con interpolación `{ name }`. */
export type HeadToHeadTranslateFn = (key: string, options: { name: string }) => string;

/**
 * Texto de columna H2H a partir de anotaciones en la clasificación (misma lógica en tabla e informes).
 * Una línea por frase (victorias y derrotas separadas).
 */
export function formatPlayerStandingHeadToHeadText(
  standing: PlayerStanding,
  t: HeadToHeadTranslateFn
): string {
  const beat = standing.h2h_beat_opponent_names ?? [];
  const lost = standing.h2h_lost_opponent_names ?? [];
  const parts = [
    ...beat.map((name) => t('stats.h2h_beat_named', { name })),
    ...lost.map((name) => t('stats.h2h_lost_named', { name })),
  ];
  return parts.join('\n');
}

/** Celda de tabla: victorias en verde y derrotas en rojo, una línea cada una. */
export function renderPlayerStandingHeadToHeadCell(
  standing: PlayerStanding,
  t: HeadToHeadTranslateFn
): ReactNode {
  const beat = standing.h2h_beat_opponent_names ?? [];
  const lost = standing.h2h_lost_opponent_names ?? [];
  if (beat.length === 0 && lost.length === 0) {
    return '\u2014';
  }
  return createElement(
    'div',
    { className: 'flex flex-col gap-0.5 text-sm text-left' },
    ...beat.map((name) =>
      createElement(
        'span',
        { key: `h2h-b-${name}`, className: 'block text-green-600 dark:text-green-400' },
        t('stats.h2h_beat_named', { name })
      )
    ),
    ...lost.map((name) =>
      createElement(
        'span',
        { key: `h2h-l-${name}`, className: 'block text-red-600 dark:text-red-400' },
        t('stats.h2h_lost_named', { name })
      )
    )
  );
}

export function hasPlayerStandingHeadToHeadAnnotations(standing: PlayerStanding): boolean {
  return (
    (standing.h2h_beat_opponent_names?.length ?? 0) > 0 ||
    (standing.h2h_lost_opponent_names?.length ?? 0) > 0
  );
}
