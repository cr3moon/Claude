/**
 * MockVerifoneAdapter
 *
 * A fully functional mock adapter for development, demos, and sites where
 * live POS connectivity is not yet configured. Uses bundled sample data.
 *
 * DISCLAIMER: This is NOT an official Verifone product, API, or integration.
 * It simulates the shape of PLU/pricebook data commonly seen in Verifone
 * Ruby 2 and Commander environments based on publicly available documentation
 * and common c-store data conventions. No proprietary code, protocols, or
 * credentials are used or implied.
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import {
  IPosAdapter,
  AdapterType,
  AdapterCapabilities,
  ConnectionConfig,
  ConnectionTestResult,
  BackupOptions,
  BackupResult,
  ImportOptions,
  ImportFormat,
  ChangeSet,
  ValidationResult,
  ApplyResult,
  RawDepartment,
  RawCategory,
  RawPluItem,
} from '../AdapterInterface';
import { XmlPluParser } from '../parsers/XmlPluParser';
import { CsvPluParser } from '../parsers/CsvPluParser';

export class MockVerifoneAdapter implements IPosAdapter {
  readonly adapterType: AdapterType = 'mock';

  readonly capabilities: AdapterCapabilities = {
    canConnect: true,
    canRead: true,
    canWrite: false, // Mock always exports to file, never writes to a live POS
    canBackup: true,
    supportsRealTime: false,
    supportedImportFormats: ['xml_plu', 'csv_pricebook', 'csv_transactions', 'csv_departments'],
    supportedExportFormats: ['xml_plu', 'csv_pricebook', 'json'],
    notes: [
      'This is a MOCK adapter for development and demonstration only.',
      'No live POS connection is made.',
      'Write-back exports a file for manual import into the POS.',
      'Replace with a site-specific adapter for production use.',
    ],
  };

  private config: ConnectionConfig | null = null;
  private connected = false;
  private xmlParser = new XmlPluParser();
  private csvParser = new CsvPluParser();

  configure(config: ConnectionConfig): void {
    this.config = { ...config, readOnly: true }; // Mock is always read-only
  }

  async connect(): Promise<ConnectionTestResult> {
    await this.simulateDelay(200);
    this.connected = true;
    return {
      success: true,
      latencyMs: 200,
      serverVersion: 'Mock v1.0.0',
      message: 'Connected to mock adapter. No live POS connection established.',
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    await this.simulateDelay(150);
    return {
      success: true,
      latencyMs: 150,
      serverVersion: 'Mock v1.0.0',
      message: 'Mock adapter is available.',
    };
  }

  async backup(options: BackupOptions): Promise<BackupResult> {
    await this.simulateDelay(300);
    const fileName = `mock_backup_${options.backupType}_${Date.now()}.json`;
    const filePath = path.join(options.destinationDir, fileName);

    // Write a lightweight manifest as the "backup"
    const manifest = {
      source: 'mock_adapter',
      backupType: options.backupType,
      createdAt: new Date().toISOString(),
      note: 'Mock backup – no real POS data was exported.',
    };

    try {
      if (!fs.existsSync(options.destinationDir)) {
        fs.mkdirSync(options.destinationDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
      return {
        success: true,
        filePath,
        fileSizeBytes: Buffer.byteLength(JSON.stringify(manifest)),
        checksum: 'mock-checksum-' + Date.now(),
        message: 'Mock backup created successfully.',
      };
    } catch (err) {
      return {
        success: false,
        filePath,
        message: `Mock backup failed: ${(err as Error).message}`,
      };
    }
  }

  async exportData(options: ImportOptions): Promise<{
    departments?: RawDepartment[];
    categories?: RawCategory[];
    items?: RawPluItem[];
    raw?: unknown;
  }> {
    await this.simulateDelay(400);

    if (options.format === 'xml_plu') {
      const samplePath = this.resolveSamplePath('mock-plu.xml');
      if (fs.existsSync(samplePath)) {
        return this.parseFile(samplePath, 'xml_plu');
      }
      return { departments: this.mockDepartments(), categories: this.mockCategories(), items: this.mockPluItems() };
    }

    if (options.format === 'csv_pricebook') {
      const samplePath = this.resolveSamplePath('mock-pricebook.csv');
      if (fs.existsSync(samplePath)) {
        return this.parseFile(samplePath, 'csv_pricebook');
      }
      return { items: this.mockPluItems() };
    }

    return { departments: this.mockDepartments(), categories: this.mockCategories(), items: this.mockPluItems() };
  }

  async parseFile(filePath: string, format: ImportFormat): Promise<{
    departments?: RawDepartment[];
    categories?: RawCategory[];
    items?: RawPluItem[];
    raw?: unknown;
  }> {
    if (format === 'xml_plu') {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.xmlParser.parse(content);
    }

    if (format === 'csv_pricebook' || format === 'csv_departments' || format === 'csv_transactions') {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.csvParser.parse(content, format);
    }

    return {};
  }

  async validateChanges(changeSet: ChangeSet): Promise<ValidationResult> {
    await this.simulateDelay(200);

    const warnings = changeSet.changes
      .filter(c => c.newValue === null || c.newValue === '')
      .map(c => ({
        code: 'EMPTY_NEW_VALUE',
        entityId: c.entityId,
        field: c.field,
        message: `Field "${c.field}" on ${c.entityId} would be set to empty.`,
        severity: 'warning' as const,
      }));

    return {
      valid: warnings.filter(w => w.severity === 'error').length === 0,
      warnings,
      errors: [],
      dryRunReport: `Dry-run complete. ${changeSet.changes.length} changes reviewed. ${warnings.length} warning(s).`,
    };
  }

  async applyChanges(changeSet: ChangeSet, backupConfirmId: string): Promise<ApplyResult> {
    await this.simulateDelay(500);

    if (!backupConfirmId) {
      return {
        success: false,
        appliedCount: 0,
        failedCount: changeSet.changes.length,
        rollbackAvailable: false,
        message: 'Backup confirmation ID is required before applying changes.',
      };
    }

    // Mock adapter always exports to file
    const exportPath = path.join(
      process.env.HOME || '.',
      '.opencstore',
      'exports',
      `changes_${changeSet.batchId}.json`
    );

    try {
      const dir = path.dirname(exportPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(exportPath, JSON.stringify(changeSet, null, 2));

      return {
        success: true,
        appliedCount: changeSet.changes.length,
        failedCount: 0,
        exportFilePath: exportPath,
        rollbackAvailable: true,
        message: `Changes exported to file for manual POS import. File: ${exportPath}`,
      };
    } catch (err) {
      return {
        success: false,
        appliedCount: 0,
        failedCount: changeSet.changes.length,
        rollbackAvailable: false,
        message: `Export failed: ${(err as Error).message}`,
      };
    }
  }

  logoutNotice(): string {
    return (
      'IMPORTANT: After importing changes into the POS, you may need to log out and log back in ' +
      'at the POS terminal for all price and item changes to take effect. ' +
      'Consult your POS documentation for the correct sync or reload procedure.'
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private resolveSamplePath(file: string): string {
    return path.join(__dirname, '..', '..', 'sample-data', file);
  }

  private mockDepartments(): RawDepartment[] {
    return [
      { pos_dept_id: '1',  name: 'TOBACCO',          tax_flag: true,  age_restricted: true,  is_fuel: false, raw: {} },
      { pos_dept_id: '2',  name: 'BEER/WINE',         tax_flag: true,  age_restricted: true,  is_fuel: false, raw: {} },
      { pos_dept_id: '3',  name: 'PACKAGED BEV',      tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '4',  name: 'SNACKS',            tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '5',  name: 'CANDY',             tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '6',  name: 'GROCERY',           tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '7',  name: 'DAIRY',             tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '8',  name: 'HOT FOOD',          tax_flag: true,  age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '9',  name: 'FUEL',              tax_flag: true,  age_restricted: false, is_fuel: true,  raw: {} },
      { pos_dept_id: '10', name: 'LOTTERY',           tax_flag: false, age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '11', name: 'CAR CARE',          tax_flag: true,  age_restricted: false, is_fuel: false, raw: {} },
      { pos_dept_id: '12', name: 'HEALTH/BEAUTY',     tax_flag: true,  age_restricted: false, is_fuel: false, raw: {} },
    ];
  }

  private mockCategories(): RawCategory[] {
    return [
      { pos_category_id: '101', pos_dept_id: '1',  name: 'CIGARETTES',       raw: {} },
      { pos_category_id: '102', pos_dept_id: '1',  name: 'CIGARS',           raw: {} },
      { pos_category_id: '103', pos_dept_id: '1',  name: 'SMOKELESS',        raw: {} },
      { pos_category_id: '201', pos_dept_id: '2',  name: 'BEER 6PK',         raw: {} },
      { pos_category_id: '202', pos_dept_id: '2',  name: 'BEER 12PK',        raw: {} },
      { pos_category_id: '203', pos_dept_id: '2',  name: 'BEER SINGLE',      raw: {} },
      { pos_category_id: '204', pos_dept_id: '2',  name: 'WINE',             raw: {} },
      { pos_category_id: '301', pos_dept_id: '3',  name: 'CARBONATED SOFT DRINKS', raw: {} },
      { pos_category_id: '302', pos_dept_id: '3',  name: 'ENERGY DRINKS',    raw: {} },
      { pos_category_id: '303', pos_dept_id: '3',  name: 'SPORTS DRINKS',    raw: {} },
      { pos_category_id: '304', pos_dept_id: '3',  name: 'WATER',            raw: {} },
      { pos_category_id: '305', pos_dept_id: '3',  name: 'JUICE',            raw: {} },
      { pos_category_id: '401', pos_dept_id: '4',  name: 'CHIPS/CRISPS',     raw: {} },
      { pos_category_id: '402', pos_dept_id: '4',  name: 'JERKY/MEAT SNACKS',raw: {} },
      { pos_category_id: '403', pos_dept_id: '4',  name: 'NUTS/SEEDS',       raw: {} },
      { pos_category_id: '501', pos_dept_id: '5',  name: 'CHOCOLATE',        raw: {} },
      { pos_category_id: '502', pos_dept_id: '5',  name: 'NON-CHOCOLATE',    raw: {} },
      { pos_category_id: '601', pos_dept_id: '6',  name: 'CONDIMENTS',       raw: {} },
      { pos_category_id: '701', pos_dept_id: '7',  name: 'MILK',             raw: {} },
      { pos_category_id: '702', pos_dept_id: '7',  name: 'EGGS',             raw: {} },
    ];
  }

  private mockPluItems(): RawPluItem[] {
    return [
      {
        pos_plu_id: '1001', description: 'MARLBORO REDS KS 20CT', description_short: 'MARL RD KS',
        department_id: '1', category_id: '101', tax_flag: true, age_restricted: true,
        foodstamp_eligible: false, unit_descriptor: 'PK', pack_size: 1,
        cost: 6.80, retail_price: 9.49,
        scan_codes: [{ barcode: '012345678901', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'PM', product_code: 'MRL-RD-KS', raw: {},
      },
      {
        pos_plu_id: '1002', description: 'MARLBORO LIGHTS KS 20CT', description_short: 'MARL LT KS',
        department_id: '1', category_id: '101', tax_flag: true, age_restricted: true,
        foodstamp_eligible: false, unit_descriptor: 'PK', pack_size: 1,
        cost: 6.80, retail_price: 9.49,
        scan_codes: [{ barcode: '012345678902', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'PM', product_code: 'MRL-LT-KS', raw: {},
      },
      {
        pos_plu_id: '1003', description: 'NEWPORT MENT KS BOX', description_short: 'NWPT MNT KS',
        department_id: '1', category_id: '101', tax_flag: true, age_restricted: true,
        foodstamp_eligible: false, unit_descriptor: 'PK', pack_size: 1,
        cost: 6.95, retail_price: 9.79,
        scan_codes: [{ barcode: '012800000108', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'RJ', product_code: 'NWP-MNT-KS', raw: {},
      },
      // ── Packaged Beverages ──────────────────────────────────────────────
      {
        pos_plu_id: '2001', description: 'COCA COLA 20OZ PET', description_short: 'COKE 20Z',
        department_id: '3', category_id: '301', tax_flag: false, age_restricted: false,
        foodstamp_eligible: true, unit_descriptor: 'EA', pack_size: 1,
        cost: 0.99, retail_price: 2.19,
        scan_codes: [{ barcode: '049000006344', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'COC', product_code: 'CC-20OZ', raw: {},
      },
      {
        pos_plu_id: '2002', description: 'PEPSI 20OZ PET', description_short: 'PEPSI 20Z',
        department_id: '3', category_id: '301', tax_flag: false, age_restricted: false,
        foodstamp_eligible: true, unit_descriptor: 'EA', pack_size: 1,
        cost: 0.95, retail_price: 2.19,
        scan_codes: [{ barcode: '012000001048', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'PEP', product_code: 'PEP-20OZ', raw: {},
      },
      {
        pos_plu_id: '2003', description: 'RED BULL 8.4OZ CAN', description_short: 'RED BULL 8Z',
        department_id: '3', category_id: '302', tax_flag: false, age_restricted: false,
        foodstamp_eligible: false, unit_descriptor: 'EA', pack_size: 1,
        cost: 1.85, retail_price: 3.49,
        scan_codes: [{ barcode: '611269991000', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'RBL', product_code: 'RB-8OZ', raw: {},
      },
      {
        pos_plu_id: '2004', description: 'MONSTER ENERGY 16OZ', description_short: 'MONSTER 16Z',
        department_id: '3', category_id: '302', tax_flag: false, age_restricted: false,
        foodstamp_eligible: false, unit_descriptor: 'EA', pack_size: 1,
        cost: 1.60, retail_price: 3.29,
        scan_codes: [{ barcode: '070847811169', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'MNS', product_code: 'MON-16OZ', raw: {},
      },
      {
        pos_plu_id: '2005', description: 'GATORADE LEMON LIME 32OZ', description_short: 'GATOR 32Z',
        department_id: '3', category_id: '303', tax_flag: false, age_restricted: false,
        foodstamp_eligible: true, unit_descriptor: 'EA', pack_size: 1,
        cost: 1.10, retail_price: 2.49,
        scan_codes: [{ barcode: '052000329841', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'GAT', product_code: 'GAT-32OZ', raw: {},
      },
      // ── Snacks ──────────────────────────────────────────────────────────
      {
        pos_plu_id: '3001', description: 'LAYS CLASSIC 2.625OZ', description_short: 'LAYS CLS',
        department_id: '4', category_id: '401', tax_flag: false, age_restricted: false,
        foodstamp_eligible: true, unit_descriptor: 'EA', pack_size: 1,
        cost: 0.99, retail_price: 1.99,
        scan_codes: [{ barcode: '028400090131', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'FRT', product_code: 'LAY-CLS', raw: {},
      },
      {
        pos_plu_id: '3002', description: "JACK LINK'S BEEF JERKY 3.25OZ", description_short: 'JKLINK 3.25',
        department_id: '4', category_id: '402', tax_flag: false, age_restricted: false,
        foodstamp_eligible: true, unit_descriptor: 'EA', pack_size: 1,
        cost: 3.45, retail_price: 5.99,
        scan_codes: [{ barcode: '017082875571', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: 'JKL', product_code: 'JL-3OZ', raw: {},
      },
      // ── Items with data quality issues for audit demo ──────────────────
      {
        pos_plu_id: '9001', description: '', description_short: '', // BLANK DESC
        department_id: '4', category_id: '401', tax_flag: false, age_restricted: false,
        foodstamp_eligible: false, unit_descriptor: undefined, pack_size: 1,
        cost: 1.20, retail_price: 1.99,
        scan_codes: [],
        vendor_code: '', product_code: '', raw: {},
      },
      {
        pos_plu_id: '9002', description: 'MARLBORO REDS KS 20CT', description_short: 'MARL RD', // DUP DESC
        department_id: '1', category_id: '101', tax_flag: false, // WRONG TAX FLAG for tobacco
        age_restricted: false, // WRONG - tobacco should be age-restricted
        foodstamp_eligible: false, unit_descriptor: 'PK', pack_size: 1,
        cost: 6.80, retail_price: 9.49,
        scan_codes: [{ barcode: '012345678901', barcode_type: 'UPC_A', is_primary: true }], // DUP UPC
        vendor_code: '', product_code: '', raw: {},
      },
      {
        pos_plu_id: '9003', description: 'GENERIC ENERGY 16 OZ', description_short: 'GEN ENRGY',
        department_id: '6', // WRONG DEPT - energy drink in grocery
        category_id: '601', tax_flag: false, age_restricted: false,
        foodstamp_eligible: false, unit_descriptor: 'ea', // inconsistent case
        pack_size: 1, cost: 1.50, retail_price: 2.00, // very low margin
        scan_codes: [{ barcode: '099999999991', barcode_type: 'UPC_A', is_primary: true }],
        vendor_code: '', product_code: '', raw: {},
      },
    ];
  }
}
