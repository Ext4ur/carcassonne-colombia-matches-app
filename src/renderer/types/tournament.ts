export type TournamentType = 'qualifier' | 'circuit';
export type TournamentStatus = 'draft' | 'in_progress' | 'completed';
export type RoundStatus = 'pending' | 'in_progress' | 'completed';
export type MatchStatus = 'pending' | 'completed';

import type {
  CompetitionFormat,
  KnockoutMatchStarter,
  KnockoutSeriesStarterMode,
  KnockoutSeeding,
  KnockoutSeries,
  KnockoutSize,
  KnockoutStage,
  KnockoutMatchStage,
  RoundPhase,
  SwissMatchStarter,
} from './knockout';

export type {
  CompetitionFormat,
  KnockoutMatchStarter,
  KnockoutMatchStage,
  KnockoutSeriesStarterMode,
  KnockoutSeeding,
  KnockoutSeries,
  KnockoutSize,
  KnockoutStage,
  RoundPhase,
  SwissMatchStarter,
};

export interface Tournament {
  id?: number;
  name: string;
  type: TournamentType;
  circuit_id?: number;
  date: string;
  status: TournamentStatus;
  players_per_match: number;
  number_of_rounds?: number;
  /** Formato de competición: suizo solo o suizo + eliminatoria. */
  competition_format?: CompetitionFormat;
  /** ISO timestamp cuando se inició la fase eliminatoria (null = aún en suizo o sin KO). */
  knockout_phase_started_at?: string | null;
  /** Required; default place is "Online". */
  place_id: number;
  /** From JOIN with places; for list/detail display. */
  place_name?: string;
  created_at?: string;
  updated_at?: string;
}

/** How to display player names in this tournament (configurable tournaments only). */
export type PlayerDisplayMode = 'per_player' | 'names_only' | 'usernames_only';

/** How Buchholz / opponent-sum tiebreaks treat byes and round-based cuts. */
export type BuchholzByeMode =
  | 'legacy'
  | 'n_minus_1'
  | 'legacy_virtual_avg'
  | 'n_minus_1_virtual_avg'
  | 'legacy_virtual_worst'
  | 'n_minus_1_virtual_worst';

const BUCHHOLZ_BYE_MODES: BuchholzByeMode[] = [
  'legacy',
  'n_minus_1',
  'legacy_virtual_avg',
  'n_minus_1_virtual_avg',
  'legacy_virtual_worst',
  'n_minus_1_virtual_worst',
];

export function normalizeBuchholzByeMode(value: unknown): BuchholzByeMode {
  if (typeof value === 'string' && (BUCHHOLZ_BYE_MODES as string[]).includes(value)) {
    return value as BuchholzByeMode;
  }
  return 'legacy';
}

export interface TournamentConfig {
  id?: number;
  tournament_id: number;
  avoid_rematches: boolean;
  tiebreak_criteria: TiebreakCriterion[];
  scoring_system: ScoringSystem;
  bye_selection?: 'worst' | 'random' | 'round_robin';
  /** Default: 'per_player'. per_player = use each player's preference; names_only = first two words; usernames_only = BGA username. */
  player_display_mode?: PlayerDisplayMode;
  /** 'greedy' (basic) or 'backtracking' (advanced). Default is 'greedy' for backwards compatibility. */
  pairing_algorithm?: 'greedy' | 'backtracking';
  /** Opponent-score tiebreaks: flat list vs per-round N−1 cut; optional virtual bye term = mean field points. */
  buchholz_bye_mode?: BuchholzByeMode;
  /** Solo si competition_format = swiss_knockout. Top N (potencia de 2). Editable hasta iniciar KO. */
  knockout_size?: KnockoutSize;
  knockout_seeding?: KnockoutSeeding;
  knockout_series?: KnockoutSeries;
  knockout_play_bronze_match?: boolean;
  knockout_match_starter?: KnockoutMatchStarter;
  /** @deprecated Usar knockout_series_starter_mode */
  knockout_series_alternate_starter?: boolean;
  knockout_series_starter_mode?: KnockoutSeriesStarterMode;
  swiss_match_starter?: SwissMatchStarter;
  /** JSON congelado al iniciar KO (clasificación suizo). */
  swiss_standings_snapshot?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TiebreakCriterion {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

export interface ScoringSystem {
  [key: number]: number; // position -> points
}

export interface Round {
  id?: number;
  tournament_id: number;
  round_number: number;
  status: RoundStatus;
  phase?: RoundPhase;
  knockout_stage?: KnockoutStage | null;
  started_at?: string;
  completed_at?: string;
}

export interface Match {
  id?: number;
  round_id: number;
  match_number: number;
  status: MatchStatus;
  first_player_id?: number;
  completed_at?: string;
  /** Orden dentro del cuadro en esa ronda KO (1-based). */
  knockout_bracket_slot?: number | null;
  /** Victorias necesarias para ganar el cruce (1 o 2). */
  series_target_wins?: number | null;
  /** Ganador del cruce cuando la serie está cerrada. */
  series_winner_id?: number | null;
  is_knockout?: boolean;
  series_meta?: string | null;
  knockout_match_stage?: KnockoutMatchStage | null;
}

export interface MatchResult {
  id?: number;
  match_id: number;
  player_id: number;
  position: number;
  points: number;
  tournament_points: number;
  /** Partida dentro de un cruce best-of-N (default 1). */
  game_number?: number;
}

export interface MatchWithResults extends Match {
  results?: MatchResultWithPlayer[];
}

export interface MatchResultWithPlayer extends MatchResult {
  player_name?: string;
  player?: {
    id: number;
    name: string;
  };
}

export interface PlayerStanding {
  player_id: number;
  player_name: string;
  total_points: number;
  wins: number;
  tiebreak_values: { [criterionId: string]: number };
  starts_count?: number;
  matches_played: number;
  active: boolean;
  dropout_round: number | null;
  /** Rivales del mismo bloque de empate (pre-H2H) a los que este jugador ganó el directo. */
  h2h_beat_opponent_names?: string[];
  /** Rivales del mismo bloque de empate a los que este jugador perdió el directo. */
  h2h_lost_opponent_names?: string[];
}
