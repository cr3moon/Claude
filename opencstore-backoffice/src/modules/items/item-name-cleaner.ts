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
 *   2. Collapse multiple spaces
 *   3. Convert to UPPER CASE (standard c-store receipt convention)
 *   4. Normalise size tokens: "20oz" → "20OZ", "12PK" stays "12PK"
 *   5. Remove trailing punctuation
 */
export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().replace(/\s+/g, ' ');
  // Upper-case the whole string (common receipt standard)
  s = s.toUpperCase();
  // Remove trailing punctuation
  s = s.replace(/[.,;:]+$/, '');
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

/**
 * Normalise a unit-of-measure string: ensure uppercase.
 * "ea" → "EA", "pk" → "PK", etc.
 */
export function normaliseUom(raw: string | null | undefined): string {
  if (!raw) return 'EA';
  const s = raw.trim().toUpperCase();
  return s || 'EA';
}

/**
 * Normalise a pack-size token to the convention "NNxx":
 *   "6pk" → "6PK", "12 pk" → "12PK", "24CT" stays "24CT"
 */
export function normalisePackSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return raw.trim().toUpperCase();
  const [, num, unit] = match;
  return `${num}${unit.toUpperCase()}`;
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
