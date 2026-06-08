import { BuchholzByeMode, normalizeBuchholzByeMode } from '../types/tournament';

export type BuchholzVirtualKind = 'none' | 'field_avg' | 'round_worst';
export type BuchholzCalculationStyle = 'legacy_flat' | 'per_round_n_minus_1';

export interface BuchholzModeMeta {
  mode: BuchholzByeMode;
  usesVirtualOpponent: boolean;
  virtualKind: BuchholzVirtualKind;
  calculationStyle: BuchholzCalculationStyle;
  modeLabelI18nKey: string;
  exampleI18nKey: string;
}

const MODE_META: Record<BuchholzByeMode, BuchholzModeMeta> = {
  legacy: {
    mode: 'legacy',
    usesVirtualOpponent: false,
    virtualKind: 'none',
    calculationStyle: 'legacy_flat',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_legacy',
    exampleI18nKey: 'tournaments.buchholz_examples.legacy',
  },
  n_minus_1: {
    mode: 'n_minus_1',
    usesVirtualOpponent: false,
    virtualKind: 'none',
    calculationStyle: 'per_round_n_minus_1',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_n_minus_1',
    exampleI18nKey: 'tournaments.buchholz_examples.n_minus_1',
  },
  legacy_virtual_avg: {
    mode: 'legacy_virtual_avg',
    usesVirtualOpponent: true,
    virtualKind: 'field_avg',
    calculationStyle: 'legacy_flat',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_legacy_virtual',
    exampleI18nKey: 'tournaments.buchholz_examples.legacy_virtual_avg',
  },
  n_minus_1_virtual_avg: {
    mode: 'n_minus_1_virtual_avg',
    usesVirtualOpponent: true,
    virtualKind: 'field_avg',
    calculationStyle: 'per_round_n_minus_1',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_n_minus_1_virtual',
    exampleI18nKey: 'tournaments.buchholz_examples.n_minus_1_virtual_avg',
  },
  legacy_virtual_worst: {
    mode: 'legacy_virtual_worst',
    usesVirtualOpponent: true,
    virtualKind: 'round_worst',
    calculationStyle: 'legacy_flat',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_legacy_virtual_worst',
    exampleI18nKey: 'tournaments.buchholz_examples.legacy_virtual_worst',
  },
  n_minus_1_virtual_worst: {
    mode: 'n_minus_1_virtual_worst',
    usesVirtualOpponent: true,
    virtualKind: 'round_worst',
    calculationStyle: 'per_round_n_minus_1',
    modeLabelI18nKey: 'tournaments.config.buchholz_bye_n_minus_1_virtual_worst',
    exampleI18nKey: 'tournaments.buchholz_examples.n_minus_1_virtual_worst',
  },
};

export function getBuchholzModeMeta(mode: unknown): BuchholzModeMeta {
  const normalized = normalizeBuchholzByeMode(mode);
  return MODE_META[normalized];
}

export function getAllBuchholzModeMetas(): BuchholzModeMeta[] {
  return [
    MODE_META.legacy,
    MODE_META.n_minus_1,
    MODE_META.legacy_virtual_avg,
    MODE_META.n_minus_1_virtual_avg,
    MODE_META.legacy_virtual_worst,
    MODE_META.n_minus_1_virtual_worst,
  ];
}
