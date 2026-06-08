import type {
  BracketMatchNode,
  BracketRoundColumn,
} from '../components/tournament/KnockoutBracket';

export interface BracketTreeLayout {
  leftRounds: BracketRoundColumn[];
  rightRounds: BracketRoundColumn[];
  final: BracketMatchNode | null;
  bronze: BracketMatchNode | null;
}

function isBronzeNode(node: BracketMatchNode): boolean {
  return node.match.knockout_match_stage === 'third_place';
}

function splitRoundMatches(col: BracketRoundColumn, side: 'left' | 'right'): BracketMatchNode[] {
  const regular = col.matches.filter((m) => !isBronzeNode(m));
  if (regular.length === 0) return [];

  const sorted = [...regular].sort(
    (a, b) => (a.match.knockout_bracket_slot ?? 0) - (b.match.knockout_bracket_slot ?? 0)
  );
  const mid = Math.ceil(sorted.length / 2);
  const slice = side === 'left' ? sorted.slice(0, mid) : sorted.slice(mid);
  return side === 'right' ? [...slice].reverse() : slice;
}

/** Construye layout simétrico: ramas izquierda/derecha + final (+ bronce) en el centro. */
export function buildBracketTree(columns: BracketRoundColumn[]): BracketTreeLayout {
  const sorted = [...columns].sort((a, b) => a.round.round_number - b.round.round_number);

  let final: BracketMatchNode | null = null;
  let bronze: BracketMatchNode | null = null;
  const middleRounds: BracketRoundColumn[] = [];

  for (const col of sorted) {
    const bronzeNodes = col.matches.filter(isBronzeNode);
    const regular = col.matches.filter((m) => !isBronzeNode(m));

    if (col.round.knockout_stage === 'final' || regular.length <= 1) {
      if (regular.length > 0) final = regular[0] ?? null;
      if (bronzeNodes.length > 0) bronze = bronzeNodes[0] ?? null;
    } else {
      middleRounds.push({ ...col, matches: regular });
    }
  }

  const leftRounds: BracketRoundColumn[] = middleRounds.map((col) => ({
    round: col.round,
    matches: splitRoundMatches(col, 'left'),
  }));

  const rightRounds: BracketRoundColumn[] = [...middleRounds].reverse().map((col) => ({
    round: col.round,
    matches: splitRoundMatches(col, 'right'),
  }));

  return { leftRounds, rightRounds, final, bronze };
}
