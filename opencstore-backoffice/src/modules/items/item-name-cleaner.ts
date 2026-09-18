/**
 * src/modules/items/item-name-cleaner.ts
 *
 * Utility functions for normalising item descriptions and abbreviations.
 * These are suggestions only – the operator reviews and approves every change.
 */

// Standard c-store abbreviations that should be uppercase
const FORCE_UPPER = new Set([
  'oz', 'fl', 'pk', 'ct', 'lb', 'ltr', 'ml', 'mg',
  'ea', 'cs', 'bx', 'bt', 'bg', 'pk', 'upc', 'id',
]);

// Words that should stay uppercase even in title-case
const ALWAYS_UPPER_WORDS = new Set([
  'upc', 'id', 'usa', 'usda', 'fda', 'ebt', 'wic',
]);

// Noise words commonly found in c-store item names that add no value
const NOISE_WORDS = [
  /\bproduct\b/gi,
  /\bitem\b/gi,
  /\bgeneric\b/gi,
];

/**
 * Produce a cleaner version of a raw item description.
 * Rules:
 *   1. Trim whitespace
 *   2. Convert to UPPER CASE (standard c-store receipt convention)
 *   3. Strip special characters, keeping only letters, digits, and spaces
 *   4. Collapse multiple spaces
 */
export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().toUpperCase();
  s = s.replace(/[^A-Z0-9 ]+/g, '');
  s = s.trim().replace(/\s+/g, ' ');
  return s;
}

/**
 * Suggest a short description (≤12 chars) from the full description.
 * Strategy: take the first N significant characters and uppercase.
 */
export function suggestShortDesc(description: string, maxLen = 12): string {
  const cleaned = cleanDescription(description);
  if (cleaned.length <= maxLen) return cleaned;

  // Try removing common long suffixes first
  const suffixes = [' OZ', ' FL OZ', ' PET', ' CAN', ' BTL', ' BOX', ' BAG', ' PKG'];
  let shortened = cleaned;
  for (const sfx of suffixes) {
    if (shortened.endsWith(sfx)) {
      shortened = shortened.slice(0, -sfx.length).trim();
      break;
    }
  }
  return shortened.slice(0, maxLen).trim();
}

// Maps recognised unit-of-measure spellings/variants to their canonical form
const UOM_ALIASES: Record<string, string> = {
  OZ: 'OZ', OUNCE: 'OZ', OUNCES: 'OZ', 'FL OZ': 'OZ', FLOZ: 'OZ',
  LB: 'LB', LBS: 'LB', POUND: 'LB', POUNDS: 'LB',
  EA: 'EA', EACH: 'EA',
  CT: 'CT', COUNT: 'CT',
  PK: 'PK', PACK: 'PK',
  GAL: 'GAL', GALLON: 'GAL', GALLONS: 'GAL',
  LTR: 'LTR', LITER: 'LTR', LITERS: 'LTR', L: 'LTR',
  ML: 'ML',
};

/**
 * Normalise a unit-of-measure string to its canonical abbreviation.
 * Unknown or blank input falls back to "EA" (each).
 */
export function normaliseUom(raw: string | null | undefined): string {
  if (!raw) return 'EA';
  const key = raw.trim().toUpperCase().replace(/\.$/, '');
  return UOM_ALIASES[key] ?? 'EA';
}

/**
 * Extract the pack size (e.g. the "6" in "COKE 6PK 12OZ") from an item
 * description. Defaults to 1 (single unit) when no pack count is found.
 */
export function normalisePackSize(description: string | null | undefined): number {
  if (!description) return 1;
  const match = description.match(/(\d+)\s*(?:PK|PACK|CT|COUNT)\b/i);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Strip obvious noise words from a description.
 * Returns the cleaned string (may be empty if entirely noise).
 */
export function stripNoise(description: string): string {
  let s = description;
  for (const pattern of NOISE_WORDS) {
    s = s.replace(pattern, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Compare two descriptions for fuzzy equality.
 * Returns a 0–1 similarity score (1 = identical after normalisation).
 */
export function descriptionSimilarity(a: string, b: string): number {
  const na = cleanDescription(a);
  const nb = cleanDescription(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  // Jaccard similarity on word sets
  const setA = new Set(na.split(/\s+/));
  const setB = new Set(nb.split(/\s+/));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
