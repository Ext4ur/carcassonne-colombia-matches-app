import { describe, it, expect } from 'vitest';
import {
  calculateNumberOfRounds,
  getEffectiveNumberOfRounds,
  getMaxPlayersForRounds,
} from '../utils/tournament';

describe('Tournament Utils (AC-47)', () => {
  describe('calculateNumberOfRounds', () => {
    it('returns 1 round for less than or equal to 2 players', () => {
      expect(calculateNumberOfRounds(0)).toBe(1);
      expect(calculateNumberOfRounds(1)).toBe(1);
      expect(calculateNumberOfRounds(2)).toBe(1);
    });

    it('returns 2 rounds for up to 4 players', () => {
      expect(calculateNumberOfRounds(3)).toBe(2);
      expect(calculateNumberOfRounds(4)).toBe(2);
    });

    it('returns 3 rounds for up to 8 players', () => {
      expect(calculateNumberOfRounds(5)).toBe(3);
      expect(calculateNumberOfRounds(8)).toBe(3);
    });

    it('returns 4 rounds for up to 16 players', () => {
      expect(calculateNumberOfRounds(9)).toBe(4);
      expect(calculateNumberOfRounds(16)).toBe(4);
    });

    it('returns 5 rounds for up to 32 players', () => {
      expect(calculateNumberOfRounds(17)).toBe(5);
      expect(calculateNumberOfRounds(32)).toBe(5);
    });

    it('returns 6 rounds for up to 64 players', () => {
      expect(calculateNumberOfRounds(33)).toBe(6);
      expect(calculateNumberOfRounds(64)).toBe(6);
    });

    it('returns 7 rounds for more than 64 players', () => {
      expect(calculateNumberOfRounds(65)).toBe(7);
      expect(calculateNumberOfRounds(128)).toBe(7);
      expect(calculateNumberOfRounds(256)).toBe(7);
    });
  });

  describe('getEffectiveNumberOfRounds', () => {
    it('uses stored value when set', () => {
      expect(getEffectiveNumberOfRounds(5, 6)).toBe(5);
    });

    it('calculates from player count when stored is missing (not 1)', () => {
      expect(getEffectiveNumberOfRounds(null, 6)).toBe(3);
      expect(getEffectiveNumberOfRounds(undefined, 6)).toBe(3);
    });
  });

  describe('getMaxPlayersForRounds', () => {
    it('returns the mathematical power of 2 correctly for given rounds', () => {
      expect(getMaxPlayersForRounds(1)).toBe(2);
      expect(getMaxPlayersForRounds(2)).toBe(4);
      expect(getMaxPlayersForRounds(3)).toBe(8);
      expect(getMaxPlayersForRounds(4)).toBe(16);
      expect(getMaxPlayersForRounds(5)).toBe(32);
      expect(getMaxPlayersForRounds(6)).toBe(64);
      expect(getMaxPlayersForRounds(7)).toBe(128);
    });
  });
});
