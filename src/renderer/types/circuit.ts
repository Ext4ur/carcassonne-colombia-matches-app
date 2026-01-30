export type CircuitStatus = 'active' | 'finalized';

export interface Circuit {
  id?: number;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  /** When 'finalized', no more tournaments can be added to the circuit. */
  status?: CircuitStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CircuitStandings {
  player_id: number;
  player_name: string;
  total_points: number;
  tournaments_played: number;
  wins: number;
}
