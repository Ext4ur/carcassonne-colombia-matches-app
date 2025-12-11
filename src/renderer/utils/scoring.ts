import { ScoringSystem } from '../types/tournament';

export function getDefaultScoringSystem(playersPerMatch: number): ScoringSystem {
  switch (playersPerMatch) {
    case 2:
      return { 1: 1, 2: 0 };
    case 3:
      return { 1: 3, 2: 1, 3: 0 };
    case 4:
      return { 1: 6, 2: 4, 3: 2, 4: 0 };
    default:
      return { 1: 1, 2: 0 };
  }
}

export function getTournamentPoints(position: number, scoringSystem: ScoringSystem): number {
  return scoringSystem[position] || 0;
}

/**
 * Calculate positions based on points
 * In case of tie, the first player (who started) loses (gets position 2 if 2 players, worse position if more)
 */
export function calculatePositions(
  results: Array<{ player_id: number; points: number }>,
  firstPlayerId?: number
): Array<{ player_id: number; position: number; points: number }> {
  // Sort by points descending
  const sorted = [...results].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    // Tie: first player loses (gets worse position)
    if (firstPlayerId !== undefined) {
      if (a.player_id === firstPlayerId) return 1; // First player goes down (worse position)
      if (b.player_id === firstPlayerId) return -1; // First player goes down (worse position)
    }
    return 0;
  });

  // Special case: if only 2 players and they're tied, first player gets position 2
  if (results.length === 2 && sorted[0].points === sorted[1].points && firstPlayerId !== undefined) {
    const positioned: Array<{ player_id: number; position: number; points: number }> = [];
    for (const result of sorted) {
      if (result.player_id === firstPlayerId) {
        positioned.push({
          player_id: result.player_id,
          position: 2,
          points: result.points,
        });
      } else {
        positioned.push({
          player_id: result.player_id,
          position: 1,
          points: result.points,
        });
      }
    }
    return positioned;
  }

  // Assign positions normally
  let currentPosition = 1;
  const positioned: Array<{ player_id: number; position: number; points: number }> = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const result = sorted[i];
    // If this player has different points than previous, update position
    if (i > 0 && sorted[i - 1].points !== result.points) {
      currentPosition = i + 1;
    }
    
    positioned.push({
      player_id: result.player_id,
      position: currentPosition,
      points: result.points,
    });
  }

  return positioned;
}

