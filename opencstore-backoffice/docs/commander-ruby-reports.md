# Commander Ruby period reports (`vrubyrept`) and live PLU catalog (`vPLUs`) — reference notes

Unlike `docs/integration-notes.md`'s fuel price/totals section (verified against a real
production Commander unit), the report methods on `CommanderNaxmlClient`
(`getReportPeriods`, `getRubyReport`) are built from a **second-hand** source: a sibling
reverse-engineering project, [StoreDesk](https://github.com/cr3moon/StoreDesk)
(submodule `TRUPALIX9/store-desk-worker`), which documents this surface against a
*different* store's Commander unit in its `docs/verifone-commander-reports.md` and
`docs/verifone-commander-price-book.md`. Treat everything below as **unverified against
this store's own unit** until confirmed — see the "Verification needed" section.

## Protocol shape

Distinct from the fuel endpoints: this is `GET /cgi-bin/CGILink?cmd=...`, not
`POST /cgi-bin/NAXML?`. Same session cookie (`validate`/`releaseCredential`), same
self-signed TLS handling.

| Step | Call |
|---|---|
| Login | `GET /cgi-bin/CGILink?cmd=validate&user=…&passwd=…` → `<cookie>` |
| Period list (Ruby reports) | `GET …&cmd=vreportpdlist&cookie=…` → `<periodInfo>` nodes, each with `<vs:period sysid="1\|2"/>` (1=SHIFT, 2=DAILY), `<name>`, `<desc>`, and `<reportParameter name="filename\|period">` values to echo back |
| Report | `GET …&cmd=vrubyrept&reptname=tax\|summary\|department\|network&filename=…&period=…&cookie=…` |
| Logout | `GET …&cmd=releaseCredential&cookie=…` |

`reptname` is mandatory — omitting it returns a `no value called reptname found` fault.
`filename=current&period=2` targets the still-open current daily.

## Report shapes (as documented by StoreDesk, from a different unit)

- **`tax`** (root `pd:taxPd`): the period's first `<totals>` block → `taxInfo` entries per
  category (`HIGH TAX`, `LOW TAX`) with `taxableSales` / `netTax`. Ignore `byCashier`/
  `byRegister` duplicate sections and zero-rate duplicate rows.
- **`summary`** (root `pd:summaryPd`): `summaryInfo.fuelSales` is the correct "Gas" KPI —
  **prefer this over** `difference.outsideSales`, which StoreDesk's notes call out as a
  lower, secondary delta that looks superficially similar but isn't the same number.
  Tender mix appears under `mop`-typed nodes (`CASH`/`CREDIT`/`DEBIT`).
- **`department`** (root `pd:departmentPd`): `deptInfo` → `vs:deptBase` (name) + `netSales`.
- **`network`** (root `pd:networkPd`): `cardInfo` entries with per-network charge totals.

## Verification needed before trusting this in production

1. Confirm `GET /cgi-bin/CGILink?cmd=vreportpdlist` returns period entries in this shape
   against this store's own Commander unit, not just the fuel-price/totals commands
   already verified.
2. Confirm the `tax`/`summary`/`department`/`network` XML nests fields exactly as
   described above — firmware versions can differ, and `CommanderNaxmlClient`'s parsers
   are deliberately tolerant (scan by tag name rather than a fixed path) specifically
   because of this uncertainty.
3. Cross-check a pulled `summary` report's `fuelSales` against the same period's fuel
   totals from the already-verified `vfueltotals` endpoint — they should be close, since
   both describe the same period's fuel revenue from two different report families.
4. Once confirmed, update this note and `integrations/commander/CommanderNaxmlClient.ts`'s
   doc comments to say "verified," matching how the fuel section is described.

## Reconciliation (first consumer)

`backend/services/ReconciliationService.ts` captures a DAILY report (summary + tax +
department breakdown) and any closed SHIFT reports for a business date into
`commander_report_snapshots`/`commander_department_report_lines`, then compares them
against `manual_sales_entries` (by department name, case-insensitive) and surfaces
`shift_checklists.over_short_amount` next to the matching SHIFT snapshot's tender totals.
Manual daily sales entry and shift-close checklists are unchanged and remain the primary
data path — this is a "Pull Commander Report" button (Dashboard → Daily Reconciliation)
that adds a second source to compare against, not a replacement. See
`src/modules/reconciliation/reconciliation-rules.ts` for the pure matching/variance logic
and its tests.

## Live PLU catalog (`vPLUs`)

Distinct command family from the reports above — sent over the same `POST /cgi-bin/NAXML`
lane as the verified fuel commands, not the `GET /cgi-bin/CGILink` lane the report family
uses. `CommanderNaxmlClient.getPluPage`/`getFullPluCatalog`/`getPluByUpc` (parsing in
`integrations/commander/plu-parser.ts`) page through a `PLUSelect` request body and parse
`<domain:PLU>` nodes: `upc`, `upcModifier`, `description`, `department` (a sysid code, not
a name), `price`, `SellUnit`, and a `taxRates` presence check used as a `tax_flag`
heuristic. Unlike the XML *file* export this app already parses
(`integrations/parsers/XmlPluParser.ts`), the live feed does **not** expose explicit
Taxable/AgeRestricted attributes — `age_restricted`/`foodstamp_eligible` default to false
and need a pass through Item Audit after any live sync.

`integrations/commander/CommanderPluAdapter.ts` wraps this as an `IPosAdapter` so a
Commander sync (Imports page → "Sync from Commander") flows through the exact same
backup → parse → persist pipeline as Mock/File import, read-only (no `uPLUs` write-back
wired). Department names are resolved best-effort via the Ruby `department` report's
`vs:deptBase sysid` attribute — the same sysid `vPLUs` reports — falling back to
`"DEPT {sysid}"` when that report doesn't have a match.

## Full T-Log ticket detail (`vtransset`)

The heaviest and least-verified surface here — a multi-MB envelope with thousands of mixed
event types per closed daily period, over the same GET `/cgi-bin/CGILink` lane as the Ruby
report family (`getTlogPeriods` reuses `vreportpdlist`'s period-list parser since
`vtlogpdlist` shares its `periodInfo` shape). `t-log-parser.ts` parses only `sale`/`network
sale` events into ticket records (lines, tenders, per-category tax); `void` events are
counted but not itemized, and `journal`/cashier events are ignored entirely.

Two documented gotchas the parser follows: a ticket's tax fields must be summed only over
tickets *without* a `preFuel` line (a fuel prepay deposit, not a real sale) — see
`computeTaxSummary`; and `taxAmt`/`taxNet` are used exactly as written, never sign-flipped.

`backend/services/TransactionSyncService.ts` imports a period's tickets into
`transactions`/`transaction_items` (idempotent — `pos_txn_id` is Commander's own
`trUniqueSN`, unique per store), surfaced on a new **Transactions** page (Dashboard sidebar)
with a per-ticket line-item breakdown. Cross-check imported totals against the Daily
Reconciliation card (same date, pulled via the separate Ruby `summary`/`department` reports)
before trusting either source alone.

## Related

- `docs/integration-notes.md` — the verified fuel price/totals section, and the overall
  Commander connection model (session handling, credential storage, TLS).
- `integrations/commander/CommanderNaxmlClient.ts` — implementation.
- `backend/services/ReconciliationService.ts` — the first Ruby-report consumer: compares a
  pulled `summary`/`department` report against manually-entered daily sales and shift totals.
- `integrations/commander/CommanderPluAdapter.ts` — the `vPLUs` consumer, wired into
  `ImportService` via the Imports page's "Sync from Commander" button.
