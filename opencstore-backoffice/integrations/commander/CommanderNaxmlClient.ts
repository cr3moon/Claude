/**
 * CommanderNaxmlClient
 *
 * A real client for the Verifone Commander's NAXML CGI protocol, based on
 * the reverse-engineered reference at github.com/cr3moon/commander-deconstructed
 * (live analysis of a production Commander unit; not derived from any
 * Verifone SDK or proprietary documentation).
 *
 * This talks to a real Commander site controller over HTTPS with a
 * self-signed certificate. It is NOT the same thing as the PLU/pricebook
 * IPosAdapter interface elsewhere in this codebase — Commander's NAXML API
 * (per the reference above) covers fuel pricing and fuel totals, not the
 * inside-store item catalog. PLU import for Commander sites still goes
 * through the File Import adapter.
 *
 * Session handling follows the reference's documented model: log in on
 * demand rather than holding a persistent session, treat the token as
 * stale after 25 minutes (conservative under the observed ~30 minute
 * session lifetime), and retry once on a LoginRequired fault. The
 * password is held only in memory for the lifetime of this client
 * instance — it is never written to disk (see connection_settings, which
 * stores host/port/username only).
 *
 * The Ruby period-report methods near the bottom of this file (SHIFT/DAILY
 * report periods and `vrubyrept`) are a separate addition sourced from a
 * *different* second-hand reference — see docs/commander-ruby-reports.md —
 * and are explicitly flagged there as unverified against a real unit from
 * this store, unlike the fuel methods above.
 */

import * as https from 'https';
import { XMLParser } from 'fast-xml-parser';
import {
  parsePeriodList, parseRubyTax, parseRubySummary, parseRubyDepartment, parseRubyNetwork,
  type CommanderReportPeriod, type RubyReportName,
  type RubyTaxReport, type RubySummaryReport, type RubyDepartmentReport, type RubyNetworkReport,
} from './ruby-report-parser';

export interface CommanderConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  /** Request timeout in ms. Commander units are typically on a slow LAN. */
  timeoutMs?: number;
}

export interface CommanderTestResult {
  success: boolean;
  latencyMs?: number;
  message: string;
}

export interface FuelGradePrice {
  sysid: number;
  name: string;
  naxmlFuelGradeId: number | null;
  inEffectCash: number | null;
  inEffectCredit: number | null;
  pendingCash: number | null;
  pendingCredit: number | null;
}

export interface FuelGradeTotal {
  grade: string;
  volumeGallons: number;
  revenueUsd: number;
  avgPrice: number | null;
}

export interface PumpHoseTotal {
  pumpSysid: number;
  hoseSysid: number;
  grade: string;
  totalMoneyUsd: number;
  totalVolumeGallons: number;
  totalTransactions: number;
}

export type FuelTotalsPeriod = 1 | 2 | 3 | 4; // shift | day | month | year

// CommanderReportPeriod, RubyReportName, RubyTaxReport, RubySummaryReport,
// RubyDepartmentReport, RubyNetworkReport are defined in and imported from
// ./ruby-report-parser (re-exported below for callers that only import
// from this file).
export type {
  CommanderReportPeriod, RubyReportName,
  RubyTaxReport, RubySummaryReport, RubyDepartmentReport, RubyNetworkReport,
} from './ruby-report-parser';

/** A price change staged for a single grade. Written to Tier 2 (Pending) only. */
export interface StagedGradePrice {
  sysid: number;
  name: string;
  cash: number;
  credit: number;
}

export class CommanderFaultError extends Error {
  constructor(public faultCode: string, faultString?: string) {
    super(`Commander fault: ${faultCode}${faultString ? ` (${faultString})` : ''}`);
    this.name = 'CommanderFaultError';
  }
}

const TOKEN_STALE_AFTER_MS = 25 * 60 * 1000; // 25 min — see class doc

const NS = {
  fuel: 'urn:vfi-sapphire:fuel.2001-10-01',
  vs: 'urn:vfi-sapphire:vs.2001-10-01',
};

export class CommanderNaxmlClient {
  private token: string | null = null;
  private tokenAt = 0;
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['fuelProduct', 'fpDispenserData', 'pump', 'hose'].includes(name),
    parseTagValue: true,
    // Deliberately false: fast-xml-parser's numeric coercion treats
    // exponential-looking strings without a leading digit (e.g. the very
    // common ethanol-blend grade names "E10"/"E15"/"E20"/"E85") as invalid
    // scientific notation and silently replaces them with NaN, corrupting
    // real grade names. All numeric attributes we care about (sysid,
    // NAXMLFuelGradeID, servLevel, tier, mop) are already explicitly
    // wrapped in Number(...) below, so leaving attributes as raw strings
    // costs nothing and avoids this data-corrupting coercion for names.
    parseAttributeValue: false,
    trimValues: true,
  });

  constructor(private config: CommanderConfig) {}

  // ─── Session ────────────────────────────────────────────────────────────

  private async login(): Promise<string> {
    const body = `cmd=validate&user=${encodeURIComponent(this.config.username)}` +
      `&passwd=${encodeURIComponent(this.config.password)}\n\n`;
    const text = await this.post(body);
    const token = this.extractTag(text, 'cookie');
    if (!token) {
      const fault = this.extractTag(text, 'faultCode');
      throw new Error(fault ? `Login failed: ${fault}` : 'Login failed: no session token in response.');
    }
    this.token = token;
    this.tokenAt = Date.now();
    return token;
  }

  /**
   * Ensures a fresh session token, sends one request via `send`, and
   * retries once on a LoginRequired fault (per the reference's §9 session
   * strategy). Shared by both request lanes below — `naxml()` (POST
   * /cgi-bin/NAXML, used for fuel prices/totals and PLU reads) and
   * `cgiLink()` (GET /cgi-bin/CGILink, used for the report family:
   * `vreportpdlist`/`vrubyrept`/`vtlogpdlist`/`vtransset`). Both endpoints
   * accept the same session cookie once logged in.
   */
  private async withSession(send: (cookie: string) => Promise<string>): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.token || Date.now() - this.tokenAt > TOKEN_STALE_AFTER_MS) {
        await this.login();
      }
      const text = await send(this.token as string);
      const fault = this.extractTag(text, 'faultCode');
      if (fault === 'CGIPortal.LoginRequired' && attempt === 0) {
        this.token = null;
        continue;
      }
      if (fault) {
        throw new CommanderFaultError(fault, this.extractTag(text, 'faultString') ?? undefined);
      }
      return text;
    }
    throw new Error('Commander request failed after re-login.');
  }

  /** POST /cgi-bin/NAXML — fuel prices/totals, pump maintenance, PLU reads. */
  private naxml(cmd: string, params: Record<string, string | number> = {}, xmlBody = ''): Promise<string> {
    return this.withSession((cookie) => {
      const extra = Object.entries(params).map(([k, v]) => `&${k}=${v}`).join('');
      const body = `cmd=${cmd}&cookie=${cookie}${extra}\n\n${xmlBody}`;
      return this.post(body);
    });
  }

  /**
   * GET /cgi-bin/CGILink — the report family (`vreportpdlist`, `vrubyrept`,
   * `vtlogpdlist`, `vtransset`). Documented as a GET-to-CGILink surface
   * distinct from the POST-to-NAXML surface the rest of this client uses;
   * observed second-hand (see class doc) rather than against our own unit.
   */
  private cgiLink(cmd: string, params: Record<string, string | number> = {}): Promise<string> {
    return this.withSession((cookie) => {
      const qs = Object.entries({ ...params, cookie })
        .map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`)
        .join('');
      return this.get(`/cgi-bin/CGILink?cmd=${cmd}${qs}`);
    });
  }

  private post(body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: this.config.host,
          port: this.config.port ?? 443,
          path: '/cgi-bin/NAXML?',
          method: 'POST',
          rejectUnauthorized: false, // Commander units use a self-signed cert (see reference §12.1)
          timeout: this.config.timeoutMs ?? 10_000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        }
      );
      req.on('timeout', () => req.destroy(new Error('Commander request timed out.')));
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private get(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: this.config.host,
          port: this.config.port ?? 443,
          path,
          method: 'GET',
          rejectUnauthorized: false,
          timeout: this.config.timeoutMs ?? 10_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        }
      );
      req.on('timeout', () => req.destroy(new Error('Commander request timed out.')));
      req.on('error', reject);
      req.end();
    });
  }

  private extractTag(text: string, tag: string): string | null {
    const start = text.indexOf(`<${tag}>`);
    if (start === -1) return null;
    const end = text.indexOf(`</${tag}>`, start);
    if (end === -1) return null;
    return text.slice(start + tag.length + 2, end).trim();
  }

  // ─── Connection test ────────────────────────────────────────────────────

  async testConnection(): Promise<CommanderTestResult> {
    const start = Date.now();
    try {
      this.token = null; // force a fresh login so this genuinely exercises credentials
      await this.login();
      return { success: true, latencyMs: Date.now() - start, message: 'Connected to Commander.' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Fuel prices (read) ─────────────────────────────────────────────────

  /** In-Effect (Tier 1) and Pending (Tier 2) prices, canonicalized to SELF service level. */
  async getFuelPrices(): Promise<FuelGradePrice[]> {
    const xml = await this.naxml('vfuelprices');
    return this.parseFuelPrices(xml);
  }

  /** Prices currently showing on the dispenser heads (may differ mid-push). */
  async getRealtimeFuelPrices(): Promise<FuelGradePrice[]> {
    const xml = await this.naxml('vfuelrtprices');
    return this.parseFuelPrices(xml);
  }

  private parseFuelPrices(xml: string): FuelGradePrice[] {
    const doc = this.parser.parse(xml) as Record<string, unknown>;
    const root = this.findNamespaced(doc, 'fuelPrices') as Record<string, unknown> | undefined;
    const products = this.toArray(
      (root?.['fuelProducts'] as Record<string, unknown>)?.['fuelProduct']
    );

    const grades: FuelGradePrice[] = [];
    for (const product of products) {
      const name = String(product['@_name'] ?? '').trim();
      // The reference (commander-deconstructed §10.7) documents unused grade
      // slots as literally name="UNUSED", but real units observed in the wild
      // deviate: numbered variants ("UNUSED1".."UNUSED20") and at least one
      // unconfigured slot whose firmware serializes its name as the literal
      // text "NaN". Filter defensively rather than matching the spec exactly.
      const upper = name.toUpperCase();
      if (!name || upper === 'NAN' || upper.startsWith('UNUSED')) continue;

      const prices = this.toArray((product['prices'] as Record<string, unknown>)?.['price']);
      const grade: FuelGradePrice = {
        sysid: Number(product['@_sysid'] ?? 0),
        name,
        naxmlFuelGradeId: product['@_NAXMLFuelGradeID'] != null ? Number(product['@_NAXMLFuelGradeID']) : null,
        inEffectCash: null, inEffectCredit: null, pendingCash: null, pendingCredit: null,
      };
      for (const p of prices) {
        const servLevel = Number(p['@_servLevel'] ?? 0);
        if (servLevel !== 1) continue; // canonical SELF level — see reference §8.1
        const tier = Number(p['@_tier'] ?? 0);
        const mop = Number(p['@_mop'] ?? 0);
        const value = Number(p['#text'] ?? p ?? NaN);
        if (isNaN(value)) continue;
        if (tier === 1 && mop === 1) grade.inEffectCash = value;
        if (tier === 1 && mop === 2) grade.inEffectCredit = value;
        if (tier === 2 && mop === 1) grade.pendingCash = value;
        if (tier === 2 && mop === 2) grade.pendingCredit = value;
      }
      grades.push(grade);
    }
    return grades.sort((a, b) => a.sysid - b.sysid);
  }

  // ─── Fuel totals (read) ─────────────────────────────────────────────────

  async getFuelTotals(period: FuelTotalsPeriod): Promise<FuelGradeTotal[]> {
    const xml = await this.naxml('vfueltotals', { period });
    const doc = this.parser.parse(xml) as Record<string, unknown>;
    const rows = this.toArray(this.findAllNamespaced(doc, 'fpDispenserData'));

    const byGrade = new Map<string, { volume: number; money: number }>();
    for (const row of rows) {
      const productNumber = row['productNumber'] as Record<string, unknown> | undefined;
      const name = String(productNumber?.['@_name'] ?? '').trim();
      if (!name) continue;
      const volume = Number((row['fuelVolume'] as Record<string, unknown>)?.['#text'] ?? row['fuelVolume'] ?? 0);
      const money = Number((row['fuelMoney'] as Record<string, unknown>)?.['#text'] ?? row['fuelMoney'] ?? 0);
      const acc = byGrade.get(name) ?? { volume: 0, money: 0 };
      acc.volume += isNaN(volume) ? 0 : volume;
      acc.money += isNaN(money) ? 0 : money;
      byGrade.set(name, acc);
    }

    return [...byGrade.entries()]
      .map(([grade, { volume, money }]) => ({
        grade,
        volumeGallons: Math.round(volume * 1000) / 1000,
        revenueUsd: Math.round(money * 100) / 100,
        avgPrice: volume > 0 ? Math.round((money / volume) * 10000) / 10000 : null,
      }))
      .sort((a, b) => a.grade.localeCompare(b.grade));
  }

  // ─── Pump maintenance totals (read) ─────────────────────────────────────

  /** Lifetime (odometer-style) totals per pump per hose — not period-specific. */
  async getPumpMaintenanceTotals(): Promise<PumpHoseTotal[]> {
    const xml = await this.naxml('vmaintfprht');
    const doc = this.parser.parse(xml) as Record<string, unknown>;
    const root = this.findNamespaced(doc, 'maintFuelPumpRtotHose') as Record<string, unknown> | undefined;
    const pumps = this.toArray((root?.['pumps'] as Record<string, unknown>)?.['pump']);

    const out: PumpHoseTotal[] = [];
    for (const pump of pumps) {
      const pumpSysid = Number(pump['@_sysid'] ?? 0);
      const hoses = this.toArray((pump['hoses'] as Record<string, unknown>)?.['hose']);
      for (const hose of hoses) {
        out.push({
          pumpSysid,
          hoseSysid: Number(hose['@_sysid'] ?? 0),
          grade: String((hose['productNumber'] as Record<string, unknown>)?.['@_name'] ?? ''),
          totalMoneyUsd: Number((hose['totalMoney'] as Record<string, unknown>)?.['#text'] ?? hose['totalMoney'] ?? 0),
          totalVolumeGallons: Number((hose['totalVolume'] as Record<string, unknown>)?.['#text'] ?? hose['totalVolume'] ?? 0),
          totalTransactions: Number(hose['totalTransactions'] ?? 0),
        });
      }
    }
    return out;
  }

  // ─── Ruby period reports (read) — see docs/commander-ruby-reports.md ───
  //
  // Unlike the fuel endpoints above (verified against a real production
  // unit), this section is built from a *second-hand* reverse-engineering
  // reference (a different store's Commander unit, documented in a sibling
  // project — see docs/commander-ruby-reports.md). The GET /cgi-bin/CGILink
  // surface, command names, and response shape are documented there with
  // real sample values, but the exact attribute/element nesting can vary
  // by firmware version. Parsing (in ruby-report-parser.ts) is deliberately
  // tolerant and MUST be confirmed against this store's own unit before
  // any number it returns is trusted for accounting purposes.

  /** SHIFT/DAILY periods for Ruby reports (`vrubyrept`). Use `filename`/`period` from here, not raw dates. */
  async getReportPeriods(): Promise<CommanderReportPeriod[]> {
    const xml = await this.cgiLink('vreportpdlist');
    return parsePeriodList(xml);
  }

  /**
   * A Ruby back-office period report (Tax / Summary / Department / Network).
   * `filename`/`period` come from `getReportPeriods()` — e.g. `current`/`2`
   * for the still-open current daily, or a closed period's own values.
   */
  async getRubyReport(reptname: 'tax', filename: string, period: string | number): Promise<RubyTaxReport>;
  async getRubyReport(reptname: 'summary', filename: string, period: string | number): Promise<RubySummaryReport>;
  async getRubyReport(reptname: 'department', filename: string, period: string | number): Promise<RubyDepartmentReport>;
  async getRubyReport(reptname: 'network', filename: string, period: string | number): Promise<RubyNetworkReport>;
  async getRubyReport(
    reptname: RubyReportName,
    filename: string,
    period: string | number
  ): Promise<RubyTaxReport | RubySummaryReport | RubyDepartmentReport | RubyNetworkReport> {
    const xml = await this.cgiLink('vrubyrept', { reptname, filename, period });
    switch (reptname) {
      case 'tax':        return parseRubyTax(xml);
      case 'summary':    return parseRubySummary(xml);
      case 'department': return parseRubyDepartment(xml);
      case 'network':    return parseRubyNetwork(xml);
    }
  }

  // ─── Fuel prices (write) — EXPERIMENTAL, see reference §13.3 ────────────
  //
  // The reference documents this write shape by inference from the read
  // schema; it was not captured from a real write made by the GWT client.
  // Callers MUST treat stagePendingPrices()/pushPendingPrices() as
  // unverified against a real unit until confirmed otherwise.

  /** Writes Tier 2 (Pending) prices. Does NOT push to dispensers — call pushPendingPrices() for that. */
  async stagePendingPrices(grades: StagedGradePrice[]): Promise<void> {
    const products = grades.map(g => `
    <fuelProduct sysid="${g.sysid}" name="${this.escapeXml(g.name)}">
      <prices>
        <price tier="2" servLevel="1" mop="1">${g.cash}</price>
        <price tier="2" servLevel="1" mop="2">${g.credit}</price>
        <price tier="2" servLevel="2" mop="1">${g.cash}</price>
        <price tier="2" servLevel="2" mop="2">${g.credit}</price>
        <price tier="2" servLevel="3" mop="1">${g.cash}</price>
        <price tier="2" servLevel="3" mop="2">${g.credit}</price>
      </prices>
    </fuelProduct>`).join('');

    const xmlBody = `<fuel:fuelPrices xmlns:fuel="${NS.fuel}" xmlns:vs="${NS.vs}">` +
      `<vs:site>1</vs:site><fuelProducts>${products}</fuelProducts></fuel:fuelPrices>`;
    await this.naxml('ufuelprices', {}, xmlBody);
  }

  /**
   * Commits staged Tier 2 prices to Tier 1 and pushes them to the physical
   * dispensers — customers pay the new price within seconds of this call.
   * Callers must get explicit operator confirmation before invoking this;
   * this client does not gate it further.
   */
  async pushPendingPrices(): Promise<void> {
    await this.naxml('cfuelprices');
  }

  // ─── XML helpers ─────────────────────────────────────────────────────────

  private toArray(v: unknown): Record<string, unknown>[] {
    if (!v) return [];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    return [v as Record<string, unknown>];
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Finds a namespace-prefixed root element (e.g. "fuel:fuelPrices") by its local name. */
  private findNamespaced(doc: Record<string, unknown>, localName: string): unknown {
    for (const key of Object.keys(doc)) {
      if (key === localName || key.endsWith(`:${localName}`)) return doc[key];
    }
    return undefined;
  }

  /** Recursively collects every element whose local (namespace-stripped) tag matches. */
  private findAllNamespaced(node: unknown, localName: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
    if (Array.isArray(node)) {
      for (const item of node) this.findAllNamespaced(item, localName, out);
      return out;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const local = key.includes(':') ? key.split(':')[1] : key;
        if (local === localName) {
          if (Array.isArray(value)) out.push(...(value as Record<string, unknown>[]));
          else out.push(value as Record<string, unknown>);
        } else {
          this.findAllNamespaced(value, localName, out);
        }
      }
    }
    return out;
  }
}
