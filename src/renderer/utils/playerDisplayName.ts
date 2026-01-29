/**
 * Resolve the display name for a player according to tournament mode and player preference.
 * Fallback: if the chosen value is missing, use the other (name <-> username).
 */

export type PlayerDisplayMode = 'per_player' | 'names_only' | 'usernames_only';

export interface PlayerForDisplay {
  name: string;
  bga_username?: string | null;
  display_preference?: 'name' | 'username' | null;
}

function nonEmpty(s: string | undefined | null): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > 0 ? t : null;
}

/** First two words of a string (primer nombre y primer apellido). */
function firstTwoWords(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ') || s.trim() || '';
}

/**
 * Returns the label to show for a player given tournament display mode.
 * - per_player: use player.display_preference ?? 'name'; fallback to the other if chosen is empty.
 * - names_only: first two words of name; fallback to bga_username, then full name.
 * - usernames_only: bga_username; fallback to name.
 */
export function getPlayerDisplayName(
  player: PlayerForDisplay,
  mode: PlayerDisplayMode = 'per_player'
): string {
  const name = nonEmpty(player.name);
  const username = nonEmpty(player.bga_username ?? null);

  switch (mode) {
    case 'per_player': {
      const pref = player.display_preference ?? 'name';
      if (pref === 'username') {
        return username ?? name ?? '—';
      }
      return name ?? username ?? '—';
    }
    case 'names_only': {
      if (name) return firstTwoWords(name);
      if (username) return firstTwoWords(username);
      return name ?? username ?? '—';
    }
    case 'usernames_only': {
      return username ?? name ?? '—';
    }
    default:
      return name ?? username ?? '—';
  }
}
