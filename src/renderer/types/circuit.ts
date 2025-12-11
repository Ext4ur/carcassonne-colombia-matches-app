export interface Circuit {
  id?: number;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
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



