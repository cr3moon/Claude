/**
 * CsvPluParser
 *
 * Parses CSV exports for PLU items, pricebooks, departments, and transactions.
 * Handles flexible column header mappings across POS export variants.
 */

import Papa from 'papaparse';
import type {
  RawDepartment,
  RawCategory,
  RawPluItem,
  RawScanCode,
  ImportFormat,
} from '../AdapterInterface';

type ParsedResult = {
  departments?: RawDepartment[];
  categories?: RawCategory[];
  items?: RawPluItem[];
  raw?: unknown;
};

// ─── Column name aliases (case-insensitive) ──────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  pos_plu_id:        ['plu', 'plu_id', 'plu number', 'plu#', 'item number', 'id', 'sku', 'item_id'],
  description:       ['description', 'desc', 'name', 'item name', 'item_name', 'item description'],
  description_short: ['short desc', 'short_desc', 'abbrev', 'abbreviation', 'short name'],
  department_id:     ['dept', 'dept_id', 'department', 'dept number', 'dept#', 'department number'],
  category_id:       ['category', 'cat', 'cat_id', 'category id', 'cat number'],
  tax_flag:          ['tax', 'taxable', 'tax_flag', 'taxed'],
  age_restricted:    ['age', 'age_restricted', 'age verify', 'age21', '21+', 'restricted'],
  foodstamp:         ['foodstamp', 'food stamp', 'ebt', 'fs eligible', 'wic'],
  unit_descriptor:   ['unit', 'uom', 'unit_descriptor', 'unit desc', 'pack unit'],
  pack_size:         ['pack_size', 'pack size', 'size', 'quantity per pack'],
  cost:              ['cost', 'unit cost', 'invoice cost', 'base cost'],
  retail_price:      ['retail', 'price', 'srp', 'retail price', 'reg price', 'regular price'],
  upc:               ['upc', 'barcode', 'scan code', 'ean', 'gtin'],
  vendor_code:       ['vendor', 'vendor code', 'supplier'],
  product_code:      ['product code', 'prod code', 'mfg code'],
};

export class CsvPluParser {
  parse(csvContent: string, format: ImportFormat): ParsedResult {
    const result = Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      transform: v => v.trim(),
    });

    if (!result.data.length) return {};

    const headers = Object.keys(result.data[0]).map(h => h.toLowerCase());
    const colMap = this.buildColumnMap(headers);

    switch (format) {
      case 'csv_departments': return { departments: this.parseDepartments(result.data, colMap) };
      case 'csv_pricebook':   return { items: this.parsePricebook(result.data, colMap) };
      default:                return { items: this.parsePluItems(result.data, colMap), raw: result };
    }
  }

  // ─── Department CSV ───────────────────────────────────────────────────────

  private parseDepartments(rows: Record<string, string>[], colMap: Record<string, string>): RawDepartment[] {
    return rows.map(row => ({
      pos_dept_id:    this.get(row, colMap['department_id']) || this.get(row, colMap['pos_plu_id']) || '',
      name:           (this.get(row, colMap['description']) || this.get(row, colMap['name'] ?? '') || '').toUpperCase().trim(),
      tax_flag:       this.parseBool(this.get(row, colMap['tax_flag'])),
      age_restricted: this.parseBool(this.get(row, colMap['age_restricted'])),
      is_fuel:        this.parseBool(this.get(row, 'is_fuel') ?? this.get(row, 'fuel')),
      raw: row,
    }));
  }

  // ─── Pricebook CSV ────────────────────────────────────────────────────────

  private parsePricebook(rows: Record<string, string>[], colMap: Record<string, string>): RawPluItem[] {
    return rows.map(row => ({
      pos_plu_id:         this.get(row, colMap['pos_plu_id']) || '',
      description:        this.get(row, colMap['description']) || '',
      description_short:  this.get(row, colMap['description_short']) || undefined,
      department_id:      this.get(row, colMap['department_id']) || undefined,
      category_id:        this.get(row, colMap['category_id']) || undefined,
      tax_flag:           this.parseBool(this.get(row, colMap['tax_flag'])),
      age_restricted:     this.parseBool(this.get(row, colMap['age_restricted'])),
      foodstamp_eligible: this.parseBool(this.get(row, colMap['foodstamp'])),
      is_fuel:            false,
      unit_descriptor:    this.get(row, colMap['unit_descriptor'])?.toUpperCase() || 'EA',
      pack_size:          this.parseNum(this.get(row, colMap['pack_size'])) || 1,
      cost:               this.parsePrice(this.get(row, colMap['cost'])),
      retail_price:       this.parsePrice(this.get(row, colMap['retail_price'])),
      scan_codes:         this.extractScanCodes(row, colMap),
      vendor_code:        this.get(row, colMap['vendor_code']) || '',
      product_code:       this.get(row, colMap['product_code']) || '',
      raw: row,
    }));
  }

  // ─── PLU CSV ─────────────────────────────────────────────────────────────

  private parsePluItems(rows: Record<string, string>[], colMap: Record<string, string>): RawPluItem[] {
    return this.parsePricebook(rows, colMap);
  }

  // ─── Scan code extraction ─────────────────────────────────────────────────

  private extractScanCodes(row: Record<string, string>, colMap: Record<string, string>): RawScanCode[] {
    const codes: RawScanCode[] = [];
    const upcVal = this.get(row, colMap['upc']);
    if (upcVal) {
      // Multiple UPCs may be pipe-separated
      const parts = upcVal.split('|').map(s => s.trim()).filter(Boolean);
      parts.forEach((barcode, i) => {
        codes.push({ barcode, barcode_type: 'UPC_A', is_primary: i === 0 });
      });
    }
    return codes;
  }

  // ─── Column mapping ───────────────────────────────────────────────────────

  private buildColumnMap(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {};

    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const found = headers.find(h => h.toLowerCase() === alias.toLowerCase());
        if (found) {
          map[field] = found;
          break;
        }
      }
    }

    // Direct key fallback
    for (const h of headers) {
      if (!Object.values(map).includes(h)) {
        map[h] = h;
      }
    }

    return map;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private get(row: Record<string, string>, colName: string | undefined): string {
    if (!colName) return '';
    // Try exact match first, then case-insensitive
    if (row[colName] !== undefined) return row[colName];
    const key = Object.keys(row).find(k => k.toLowerCase() === colName.toLowerCase());
    return key ? row[key] : '';
  }

  private parseBool(v: string | undefined): boolean {
    if (!v) return false;
    return ['true', 'yes', 'y', '1', 'x', 'checked'].includes(v.toLowerCase().trim());
  }

  private parseNum(v: string | undefined): number {
    if (!v) return 0;
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  private parsePrice(v: string | undefined): number | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? undefined : n;
  }
}
