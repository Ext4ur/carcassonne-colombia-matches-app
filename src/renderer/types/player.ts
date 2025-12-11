export interface Player {
  id?: number;
  name: string;
  bga_username?: string;
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



