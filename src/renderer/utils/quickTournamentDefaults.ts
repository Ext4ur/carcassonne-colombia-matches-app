import {
  BuchholzByeMode,
  normalizeBuchholzByeMode,
  ScoringSystem,
  TiebreakCriterion,
  TournamentConfig,
} from '../types/tournament';
import { getDefaultScoringSystem } from './scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from './tiebreak';

export const QUICK_TOURNAMENT_DEFAULTS_KEY = 'carcassonne.quickTournament.defaults';

export type QuickTournamentDefaultsStored = {
  avoid_rematches?: boolean;
  tiebreak_criteria?: TiebreakCriterion[];
  scoring_system?: ScoringSystem;
  bye_selection?: 'worst' | 'random' | 'round_robin';
  player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
  pairing_algorithm?: 'greedy' | 'backtracking';
  buchholz_bye_mode?: BuchholzByeMode;
  /** `scoring_system` applies when it matches the tournament's players_per_match. */
  scoring_players_per_match?: number;
};

export function readQuickTournamentDefaults(): QuickTournamentDefaultsStored | null {
  try {
    const raw = localStorage.getItem(QUICK_TOURNAMENT_DEFAULTS_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as QuickTournamentDefaultsStored;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeQuickTournamentDefaults(data: QuickTournamentDefaultsStored): void {
  localStorage.setItem(QUICK_TOURNAMENT_DEFAULTS_KEY, JSON.stringify(data));
}

export function clearQuickTournamentDefaults(): void {
  localStorage.removeItem(QUICK_TOURNAMENT_DEFAULTS_KEY);
}

/** Defaults for the quick-create wizard (torneo rápido), merged with persisted prefs. */
export function buildQuickConfigDraft(playersPerMatch: number): Partial<TournamentConfig> & {
  bye_selection?: 'worst' | 'random' | 'round_robin';
  player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
  pairing_algorithm?: 'greedy' | 'backtracking';
  buchholz_bye_mode?: BuchholzByeMode;
} {
  const ppm = Math.min(4, Math.max(2, playersPerMatch || 2));
  const stored = readQuickTournamentDefaults();
  const useStoredScoring =
    stored?.scoring_system &&
    stored.scoring_players_per_match != null &&
    stored.scoring_players_per_match === ppm;

  return {
    avoid_rematches: stored?.avoid_rematches ?? true,
    tiebreak_criteria: stored?.tiebreak_criteria ?? DEFAULT_TIEBREAK_CRITERIA,
    scoring_system: useStoredScoring ? stored.scoring_system! : getDefaultScoringSystem(ppm),
    bye_selection: stored?.bye_selection ?? 'worst',
    player_display_mode: stored?.player_display_mode ?? 'per_player',
    pairing_algorithm: stored?.pairing_algorithm ?? 'greedy',
    buchholz_bye_mode: normalizeBuchholzByeMode(stored?.buchholz_bye_mode),
  };
}
