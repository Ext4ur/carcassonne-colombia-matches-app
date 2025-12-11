/**
 * Calculate the number of rounds needed for a tournament
 * Uses the closest power of 2 to the number of players
 */
export function calculateNumberOfRounds(numPlayers: number): number {
  if (numPlayers < 2) return 1;
  if (numPlayers <= 2) return 1;
  if (numPlayers <= 4) return 2;
  if (numPlayers <= 8) return 3;
  if (numPlayers <= 16) return 4;
  if (numPlayers <= 32) return 5;
  if (numPlayers <= 64) return 6;
  // For more than 64 players, use 7 rounds (2^7 = 128)
  return 7;
}

/**
 * Get the maximum number of players for a given number of rounds
 */
export function getMaxPlayersForRounds(rounds: number): number {
  return Math.pow(2, rounds);
}



