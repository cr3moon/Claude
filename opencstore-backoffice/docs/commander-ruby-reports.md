# Commander Ruby period reports (`vrubyrept`) — reference notes

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

## Related

- `docs/integration-notes.md` — the verified fuel price/totals section, and the overall
  Commander connection model (session handling, credential storage, TLS).
- `integrations/commander/CommanderNaxmlClient.ts` — implementation.
- `backend/services/ReconciliationService.ts` — the first consumer: compares a pulled
  `summary`/`department` report against manually-entered daily sales and shift totals.
