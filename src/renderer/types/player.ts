/** When both name and bga_username exist, which to show by default. */
export type PlayerDisplayPreference = 'name' | 'username';

export interface Player {
  id?: number;
  name: string;
  bga_username?: string;
  /** Default: 'name'. Used when both name and bga_username exist. */
  display_preference?: PlayerDisplayPreference;
  phone?: string;
  email?: string;
  age?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerWithStats extends Player {
  total_tournaments?: number;
  total_wins?: number;
  total_points?: number;
}
