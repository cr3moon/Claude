# Integration Notes

## POS Adapter Architecture

OpenCStore Back Office uses an **adapter pattern** to isolate PLU/pricebook-catalog logic
behind a common interface (`IPosAdapter`), defined in `integrations/AdapterInterface.ts`.
Adapters run in the **main process only** (`app/main/index.ts` instantiates them) — the
renderer has no Node.js access (`contextIsolation: true`, `nodeIntegration: false`) and only
calls IPC handles via `window.electronAPI`.

An earlier iteration of this app had a second, parallel copy of the adapter pattern under
`src/modules/integrations/` (renderer-side `.adapter.ts` files). That code was dead —
nothing imported it — and broken by design: it called Node's `fs`/`path` directly from
sandboxed renderer code, which cannot work under `contextIsolation`. It has been removed.
If you're looking for the real adapters, they're all under `integrations/` at the repo root.

---

## IPosAdapter Interface

Every PLU/pricebook adapter implements:

| Method                        | Description                                                    |
|--------------------------------|-----------------------------------------------------------------|
| `configure(config)`           | Store connection config. Does not connect yet.                  |
| `connect()` / `testConnection()` | Open / ping the connection.                                  |
| `backup(options)`             | Snapshot before any read/write session.                         |
| `exportData(options)`         | Read departments/categories/items from the POS.                 |
| `parseFile(path, format)`     | Parse a local XML/CSV export without a live connection.          |
| `validateChanges(changeSet)`  | Dry-run validation; returns warnings/errors.                     |
| `applyChanges(changeSet, backupConfirmId)` | Write approved changes (after backup + validation). |
| `logoutNotice()`              | Human-readable POS logout/login reminder, if any.                |
| `disconnect()`                | Cleanly close the connection.                                    |

Types are defined in `integrations/AdapterInterface.ts`.

### Available adapters

There is currently one adapter class, `MockVerifoneAdapter`
(`integrations/adapters/MockVerifoneAdapter.ts`), instantiated twice in `app/main/index.ts`
with a different `adapterType` label depending on which IPC handler calls it:

| IPC handler | `adapterType` | Behavior |
|---|---|---|
| `import:runMockImport` | `'mock'` | Calls `exportData()`. Reads bundled `sample-data/mock-plu.xml` / `mock-pricebook.csv` when present, else falls back to synthetic in-code sample data. |
| `import:fromFile` | `'file_import'` | Calls `parseFile(sourceFile, format)` on the operator-selected file (via `import:openFileDialog`) — reads and parses the real file, not sample data. |

Both paths are read-only (`readOnly: true`); `applyChanges` is never invoked for PLU data —
price change write-back (`ufuelprices`/`cfuelprices` for fuel; there is no PLU write-back)
is a distinct, separate concern from import.

`verifone_ruby2` / `commander` (PLU catalog import) are **not implemented** — no file-based or
API-based PLU import path exists yet beyond generic File Import. See the next section for the
real Commander connection that *does* exist, which covers fuel pricing, not the PLU catalog.

---

## Real Verifone Commander connection (fuel pricing, not PLU)

Unlike the placeholder above, there **is** a real, working connection to a live Verifone
Commander unit — but it covers a different domain. Commander's actual API (reverse-engineered
and documented at [github.com/cr3moon/commander-deconstructed](https://github.com/cr3moon/commander-deconstructed))
is a single CGI endpoint (`POST /cgi-bin/NAXML?`) speaking a proprietary XML-over-HTTP protocol
called NAXML, over HTTPS with a self-signed certificate. It covers **fuel pricing and fuel
totals** — dispenser prices, shift/day/month/year fuel sales, pump maintenance counters — not
the inside-store PLU/item catalog. PLU import for a Commander site still goes through File
Import.

Implementation:

- `integrations/commander/CommanderNaxmlClient.ts` — the real client (main process, Node
  `https` with `rejectUnauthorized: false`, login-on-demand session handling with a 25-minute
  staleness threshold and one retry on `CGIPortal.LoginRequired`, matching the reference's
  documented session strategy).
- IPC handlers in `app/main/index.ts`: `commander:testConnection`, `commander:getFuelPrices`,
  `commander:getFuelTotals`, `commander:getPumpMaintenanceTotals`,
  `commander:getConnectionSettings`.
- Renderer facade: `src/modules/integrations/commander-naxml.service.ts`.
- UI: the "Fuel POS Connection" card on the Settings page (`src/components/Settings/CommanderConnectionCard.tsx`)
  — host/port/username/password, Test Connection, and a live current-prices table once connected.

**What's wired vs. not:** reads (`vfuelprices`, `vfueltotals`, `vmaintfprht`) are wired end to
end, including the Settings UI. Writes (`ufuelprices` to stage Tier‑2 pending prices,
`cfuelprices` to push them live to the dispensers) exist on `CommanderNaxmlClient` but are
**not** wired to any IPC handler or UI control. The reference itself flags the write XML shape
as inferred from the read schema, not captured from a real write (see its §13.3) — treat it as
unverified until confirmed against a real unit, and don't wire it to a button without an
explicit operator-confirmation step, given a push takes effect at the pump within seconds.

**Grade names, real-world quirks, and the per-site display filter:** a live production unit's
`vfuelprices` response can deviate from the reference's documented shape — observed: unused
slots numbered `UNUSED1`..`UNUSEDn` rather than the literal `name="UNUSED"` the reference
documents (§10.7), which `CommanderNaxmlClient.parseFuelPrices` now filters by prefix, not exact
match. Also note: `fast-xml-parser`'s `parseAttributeValue` option is deliberately **off** on
this client's parser — with it on, a real grade name like `"E10"` (a standard ethanol-blend fuel
grade) gets misread as malformed scientific notation and silently coerced to the JS value `NaN`,
corrupting the name. Beyond unused slots, a site's unit may also report real, configured grades
the operator doesn't actually sell at that location — there's no protocol-level way to distinguish
"configured but irrelevant to this site" from "the grades I sell," so this is a per-site,
user-configured allow-list, not something the client can filter automatically. It's stored under
the `commander_visible_grades` `app_settings` key (JSON array of grade names; unset or `[]` means
no filter, show everything) via `commander:getVisibleGrades`/`commander:setVisibleGrades` IPC, and
edited from the "Grades to Show" checkboxes under the Settings page's fuel prices table.

### Credentials

`connection_settings` stores `host`/`port`/`username_hint` only — **never the password**. The
password is entered fresh in the Settings UI each time a connection is tested/established and
held only in the main process's memory for the lifetime of `commanderClient`
(`app/main/index.ts`); it is lost on app restart and never written to disk. This matches the
Commander reference's own security guidance (§12.3): the session token is functionally a
password and should never be persisted.

---

## Adding a new PLU/pricebook adapter

1. Create `integrations/adapters/MyAdapter.ts` implementing `IPosAdapter`.
2. Wire it into the relevant `import:*` IPC handlers in `app/main/index.ts`.
3. Add the adapter type to `AdapterType` in `integrations/AdapterInterface.ts`.
4. Add a user-facing label to the onboarding page (`src/pages/OnboardingPage.tsx`).

## Backup-Before-Write Contract

Every adapter that implements `applyChanges` **MUST** be called only after the application has:

1. Created a `backup_manifest` record.
2. Confirmed the backup `status` is `'complete'`.
3. Displayed a user confirmation dialog.

This is enforced in the application layer, not the adapter.
