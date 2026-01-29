export type TournamentType = 'qualifier' | 'circuit';
export type TournamentStatus = 'draft' | 'in_progress' | 'completed';
export type RoundStatus = 'pending' | 'in_progress' | 'completed';
export type MatchStatus = 'pending' | 'completed';

export interface Tournament {
  id?: number;
  name: string;
  type: TournamentType;
  circuit_id?: number;
  date: string;
  status: TournamentStatus;
  players_per_match: number;
  number_of_rounds?: number;
  created_at?: string;
  updated_at?: string;
}

/** How to display player names in this tournament (configurable tournaments only). */
export type PlayerDisplayMode = 'per_player' | 'names_only' | 'usernames_only';

export interface TournamentConfig {
  id?: number;
  tournament_id: number;
  avoid_rematches: boolean;
  tiebreak_criteria: TiebreakCriterion[];
  scoring_system: ScoringSystem;
  bye_selection?: 'worst' | 'random' | 'round_robin';
  /** Default: 'per_player'. per_player = use each player's preference; names_only = first two words; usernames_only = BGA username. */
  player_display_mode?: PlayerDisplayMode;
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
}

export interface MatchResult {
  id?: number;
  match_id: number;
  player_id: number;
  position: number;
  points: number;
  tournament_points: number;
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
}

