/**
 * XmlPluParser
 *
 * Parses PLU/item-master XML exports commonly produced by
 * Verifone Commander and Ruby 2 back-office utilities.
 *
 * The XML schema below is a representative approximation derived from
 * publicly observable file-based exports. It is NOT based on any
 * proprietary Verifone SDK or internal API documentation.
 *
 * Supported root element names: <PLUFile>, <ItemMaster>, <PricebookExport>
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  RawDepartment,
  RawCategory,
  RawPluItem,
  RawScanCode,
} from '../AdapterInterface';

interface ParsedResult {
  departments?: RawDepartment[];
  categories?: RawCategory[];
  items?: RawPluItem[];
  raw?: unknown;
}

export class XmlPluParser {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) =>
      ['Department', 'Category', 'Item', 'PLU', 'ScanCode', 'Barcode', 'UPC'].includes(name),
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
  });

  parse(xmlContent: string): ParsedResult {
    let doc: Record<string, unknown>;
    try {
      doc = this.parser.parse(xmlContent) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`XML parse error: ${(err as Error).message}`);
    }

    // Detect root element
    const root = (doc['PLUFile'] || doc['ItemMaster'] || doc['PricebookExport'] || doc) as Record<string, unknown>;

    const departments = this.parseDepartments(root);
    const categories  = this.parseCategories(root);
    const items       = this.parseItems(root, departments, categories);

    return { departments, categories, items, raw: doc };
  }

  // ─── Departments ─────────────────────────────────────────────────────────

  private parseDepartments(root: Record<string, unknown>): RawDepartment[] {
    const depts = this.toArray(
      (root['Departments'] as Record<string, unknown>)?.['Department'] ??
      root['Department'] ?? []
    );

    return depts.map((d: Record<string, unknown>) => ({
      pos_dept_id:   String(d['@_id'] ?? d['ID'] ?? d['DeptNumber'] ?? d['Number'] ?? ''),
      name:          String(d['@_Name'] ?? d['Name'] ?? d['Description'] ?? d['DeptName'] ?? '').toUpperCase().trim(),
      tax_flag:      this.parseBool(d['@_Taxable'] ?? d['Taxable'] ?? d['Tax'] ?? d['TaxFlag'] ?? false),
      age_restricted:this.parseBool(d['@_AgeRestricted'] ?? d['AgeRestricted'] ?? d['AgeVerify'] ?? d['Age21'] ?? false),
      is_fuel:       this.parseBool(d['@_IsFuel'] ?? d['IsFuel'] ?? d['Fuel'] ?? false),
      raw: d,
    }));
  }

  // ─── Categories ──────────────────────────────────────────────────────────

  private parseCategories(root: Record<string, unknown>): RawCategory[] {
    const cats = this.toArray(
      (root['Categories'] as Record<string, unknown>)?.['Category'] ??
      root['Category'] ?? []
    );

    return cats.map((c: Record<string, unknown>) => ({
      pos_category_id: String(c['@_id'] ?? c['ID'] ?? c['CatNumber'] ?? ''),
      pos_dept_id:     String(c['@_deptId'] ?? c['DeptID'] ?? c['DepartmentID'] ?? c['DeptNumber'] ?? ''),
      name:            String(c['@_Name'] ?? c['Name'] ?? c['Description'] ?? '').toUpperCase().trim(),
      raw: c,
    }));
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  private parseItems(
    root: Record<string, unknown>,
    _departments: RawDepartment[],
    _categories: RawCategory[]
  ): RawPluItem[] {
    const items = this.toArray(
      (root['Items'] as Record<string, unknown>)?.['Item'] ??
      (root['PLUs'] as Record<string, unknown>)?.['PLU'] ??
      root['Item'] ??
      root['PLU'] ?? []
    );

    return items.map((item: Record<string, unknown>) => {
      const scanCodes = this.parseScanCodes(item);
      return {
        pos_plu_id:         String(item['@_id'] ?? item['PLUNumber'] ?? item['ID'] ?? item['Number'] ?? ''),
        description:        String(item['Description'] ?? item['Name'] ?? item['Desc'] ?? '').trim(),
        description_short:  String(item['ShortDesc'] ?? item['Abbrev'] ?? item['Abbreviation'] ?? '').trim(),
        department_id:      String(item['@_deptId'] ?? item['DeptID'] ?? item['DepartmentID'] ?? item['Dept'] ?? ''),
        category_id:        String(item['@_catId'] ?? item['CatID'] ?? item['CategoryID'] ?? item['Category'] ?? ''),
        tax_flag:           this.parseBool(item['@_Taxable'] ?? item['Taxable'] ?? item['Tax'] ?? item['TaxFlag'] ?? false),
        age_restricted:     this.parseBool(item['@_AgeRestricted'] ?? item['AgeRestricted'] ?? item['AgeVerify'] ?? item['Age21'] ?? false),
        foodstamp_eligible: this.parseBool(item['@_Foodstamp'] ?? item['Foodstamp'] ?? item['FoodStamp'] ?? item['EBT'] ?? false),
        is_fuel:            this.parseBool(item['@_IsFuel'] ?? item['IsFuel'] ?? item['Fuel'] ?? false),
        unit_descriptor:    String(item['UnitDesc'] ?? item['Unit'] ?? item['UOM'] ?? 'EA').trim().toUpperCase(),
        pack_size:          this.parseNum(item['PackSize'] ?? item['Size'] ?? 1),
        cost:               this.parsePrice(item['Cost'] ?? item['UnitCost']),
        retail_price:       this.parsePrice(item['Retail'] ?? item['Price'] ?? item['RetailPrice'] ?? item['SRP']),
        scan_codes:         scanCodes,
        vendor_code:        String(item['VendorCode'] ?? item['Vendor'] ?? '').trim(),
        product_code:       String(item['ProductCode'] ?? item['ProdCode'] ?? item['SKU'] ?? '').trim(),
        raw: item,
      };
    });
  }

  // ─── Scan codes ──────────────────────────────────────────────────────────

  private parseScanCodes(item: Record<string, unknown>): RawScanCode[] {
    const codes: RawScanCode[] = [];

    // Inline barcode on the item element
    const inlineUPC = item['UPC'] ?? item['Barcode'] ?? item['ScanCode'];
    if (inlineUPC) {
      codes.push({ barcode: String(inlineUPC).trim(), barcode_type: 'UPC_A', is_primary: true });
    }

    // Nested ScanCodes / Barcodes list
    const nested = this.toArray(
      (item['ScanCodes'] as Record<string, unknown>)?.['ScanCode'] ??
      (item['Barcodes'] as Record<string, unknown>)?.['Barcode'] ??
      item['ScanCode'] ?? item['Barcode'] ?? []
    );

    nested.forEach((sc: Record<string, unknown>, i: number) => {
      const barcode = String(sc['#text'] ?? sc['Value'] ?? sc['Code'] ?? sc ?? '').trim();
      if (barcode && !codes.find(c => c.barcode === barcode)) {
        codes.push({
          barcode,
          barcode_type: String(sc['@_type'] ?? sc['Type'] ?? 'UPC_A').trim().toUpperCase(),
          is_primary: codes.length === 0 || Boolean(sc['@_primary'] ?? sc['Primary'] ?? i === 0),
        });
      }
    });

    return codes;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private toArray(v: unknown): Record<string, unknown>[] {
    if (!v) return [];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    return [v as Record<string, unknown>];
  }

  private parseBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      return ['true', 'yes', 'y', '1', 'x'].includes(v.toLowerCase().trim());
    }
    return false;
  }

  private parseNum(v: unknown): number {
    const n = Number(v);
    return isNaN(n) ? 1 : n;
  }

  private parsePrice(v: unknown): number | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? undefined : n;
  }
}
