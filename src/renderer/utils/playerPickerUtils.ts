export interface PlayerPickerOption {
  value: number;
  label: string;
  bga_username?: string;
}

/** Filters player picker options by name or BGA username (case-insensitive). */
export function filterPlayerOptions(
  term: string,
  options: PlayerPickerOption[]
): PlayerPickerOption[] {
  const q = term.trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => {
    if (opt.label.toLowerCase().includes(q)) return true;
    if (opt.bga_username?.toLowerCase().includes(q)) return true;
    return false;
  });
}
