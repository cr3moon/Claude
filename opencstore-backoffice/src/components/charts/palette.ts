/**
 * src/components/charts/palette.ts
 *
 * Validated categorical palette (light mode only — this app has no dark
 * mode) from the dataviz skill's reference instance. Order is the
 * CVD-safety mechanism, not cosmetic — never reorder or cycle past slot 8
 * without re-running the validator.
 */

export const CATEGORICAL_COLORS = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

export const CHART_CHROME = {
  surface: '#fcfcfb',
  primaryInk: '#0b0b0b',
  secondaryInk: '#52514e',
  mutedInk: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
} as const;

/** "Other" and other neutral buckets always get this, never a categorical slot. */
export const NEUTRAL_COLOR = '#c3c2b7';

export function categoricalColor(index: number): string {
  return CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
}
