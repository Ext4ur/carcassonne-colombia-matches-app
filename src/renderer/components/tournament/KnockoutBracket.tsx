import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Match, Round } from '../../types/tournament';
import { knockoutStageI18nKey } from '../../types/knockout';
import { buildBracketTree } from '../../utils/knockoutBracketTree';

export interface BracketMatchNode {
  match: Match;
  player1Name: string;
  player2Name: string;
  winnerName?: string;
  seriesLabel?: string;
}

export interface BracketRoundColumn {
  round: Round;
  matches: BracketMatchNode[];
}

interface KnockoutBracketProps {
  columns: BracketRoundColumn[];
}

function MatchNode({ node, t }: { node: BracketMatchNode; t: TFunction }) {
  return (
    <div className="relative border rounded-lg p-2.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-sm min-w-[140px] shadow-sm">
      <div
        className={
          node.winnerName && node.winnerName === node.player1Name
            ? 'font-bold text-green-700 dark:text-green-400 truncate'
            : 'truncate'
        }
      >
        {node.player1Name}
      </div>
      <div className="text-[10px] text-gray-400 my-0.5 text-center">vs</div>
      <div
        className={
          node.winnerName && node.winnerName === node.player2Name
            ? 'font-bold text-green-700 dark:text-green-400 truncate'
            : 'truncate'
        }
      >
        {node.player2Name}
      </div>
      {node.seriesLabel && (
        <div className="text-[10px] text-gray-500 mt-1 text-center">{node.seriesLabel}</div>
      )}
      {node.winnerName && (
        <div className="text-[10px] mt-1 text-primary-600 dark:text-primary-400 text-center truncate">
          {t('knockout.bracket.winner', { name: node.winnerName })}
        </div>
      )}
    </div>
  );
}

function RoundColumn({
  col,
  t,
  align,
}: {
  col: BracketRoundColumn;
  t: TFunction;
  align: 'left' | 'right';
}) {
  if (col.matches.length === 0) return null;
  return (
    <div
      className={`flex flex-col gap-6 justify-around min-h-full ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 w-full mb-1">
        {col.round.knockout_stage
          ? t(knockoutStageI18nKey(col.round.knockout_stage))
          : t('tournaments.round_n', { n: col.round.round_number })}
      </h4>
      {col.matches.map((node) => (
        <MatchNode key={node.match.id} node={node} t={t} />
      ))}
    </div>
  );
}

function TrophyCenter({
  final,
  bronze,
  t,
}: {
  final: BracketMatchNode | null;
  bronze: BracketMatchNode | null;
  t: TFunction;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 min-w-[180px]">
      <div className="flex flex-col items-center gap-1">
        <svg
          viewBox="0 0 64 64"
          className="w-14 h-14 text-amber-500 dark:text-amber-400"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M16 8h32v6c0 8-4 14-10 18 6 4 10 10 10 18v4H16v-4c0-8 4-14 10-18C20 28 16 22 16 14V8zm8 4v2c0 6 3 11 8 14 5-3 8-8 8-14v-2H24zm16 36v2H24v-2h16zM12 12h4v2c0 6 2 10 6 13l-2 3C14 25 10 19 10 12v-2h2zm40 0h4v2c0 7-4 13-10 18l-2-3c4-3 6-7 6-13v-2h2z"
          />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          {t('knockout.bracket.final_title')}
        </span>
      </div>
      {final ? (
        <MatchNode node={final} t={t} />
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {t('knockout.bracket.empty')}
        </p>
      )}
      {bronze && (
        <div className="w-full border-t border-gray-200 dark:border-gray-600 pt-3">
          <p className="text-xs font-semibold text-center text-amber-800 dark:text-amber-200 mb-2">
            {t('knockout.stage.third_place')}
          </p>
          <MatchNode node={bronze} t={t} />
        </div>
      )}
    </div>
  );
}

export default function KnockoutBracket({ columns }: KnockoutBracketProps) {
  const { t } = useTranslation();

  const tree = useMemo(() => buildBracketTree(columns), [columns]);

  if (columns.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('knockout.bracket.empty')}</p>
    );
  }

  const hasSideRounds =
    tree.leftRounds.some((c) => c.matches.length > 0) ||
    tree.rightRounds.some((c) => c.matches.length > 0);

  if (!hasSideRounds && !tree.final) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('knockout.bracket.empty')}</p>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-stretch justify-center gap-2 min-w-max py-4 px-2">
        {/* Rama izquierda */}
        <div className="flex gap-6 items-stretch">
          {tree.leftRounds.map((col) => (
            <RoundColumn key={`L-${col.round.id}`} col={col} t={t} align="left" />
          ))}
        </div>

        {/* Conectores visuales hacia el centro */}
        {hasSideRounds && (
          <div className="flex flex-col justify-center w-6">
            <div className="flex-1 border-r-2 border-t-2 border-gray-300 dark:border-gray-600 rounded-tr-lg min-h-[40px]" />
            <div className="flex-1 border-r-2 border-b-2 border-gray-300 dark:border-gray-600 rounded-br-lg min-h-[40px]" />
          </div>
        )}

        <TrophyCenter final={tree.final} bronze={tree.bronze} t={t} />

        {hasSideRounds && (
          <div className="flex flex-col justify-center w-6">
            <div className="flex-1 border-l-2 border-t-2 border-gray-300 dark:border-gray-600 rounded-tl-lg min-h-[40px]" />
            <div className="flex-1 border-l-2 border-b-2 border-gray-300 dark:border-gray-600 rounded-bl-lg min-h-[40px]" />
          </div>
        )}

        {/* Rama derecha */}
        <div className="flex gap-6 items-stretch flex-row-reverse">
          {tree.rightRounds.map((col) => (
            <RoundColumn key={`R-${col.round.id}`} col={col} t={t} align="right" />
          ))}
        </div>
      </div>
    </div>
  );
}
