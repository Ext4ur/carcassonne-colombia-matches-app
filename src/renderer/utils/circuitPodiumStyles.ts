/** Row classes for circuit standings positions 1–4 (podium zone). */
export function getCircuitPodiumRowClass(position: number): string {
  switch (position) {
    case 1:
      return 'bg-yellow-100/70 dark:bg-yellow-900/45 font-semibold';
    case 2:
      return 'bg-slate-100/80 dark:bg-slate-700/50 font-semibold';
    case 3:
      return 'bg-orange-100/70 dark:bg-orange-900/35 font-semibold';
    case 4:
      return 'bg-blue-50/90 dark:bg-blue-900/25 font-semibold';
    default:
      return '';
  }
}
