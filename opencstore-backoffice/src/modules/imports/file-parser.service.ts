/**
 * src/modules/imports/file-parser.service.ts
 *
 * Renderer-side wrapper that detects file format from extension
 * and delegates to the correct IPC import handler.
 */

export type DetectedFormat = 'xml_plu' | 'csv_pricebook' | 'csv_transactions' | 'unknown';

/**
 * Detect the most likely ImportFormat from a file extension.
 * Returns 'unknown' when the format cannot be determined.
 */
export function detectFormat(filePath: string): DetectedFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xml')  return 'xml_plu';
  if (ext === 'csv' || ext === 'txt') return 'csv_pricebook'; // default CSV intent
  return 'unknown';
}

/**
 * Return a user-readable description of the detected format.
 */
export function formatLabel(format: DetectedFormat): string {
  switch (format) {
    case 'xml_plu':          return 'XML PLU export';
    case 'csv_pricebook':    return 'CSV pricebook / PLU export';
    case 'csv_transactions': return 'CSV transaction export';
    default:                 return 'Unknown format';
  }
}

/**
 * List of supported file extensions for the import file dialog.
 */
export const SUPPORTED_EXTENSIONS = ['xml', 'csv', 'txt'];
