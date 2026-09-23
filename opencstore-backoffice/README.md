# OpenCStore Back Office

**Free, local-first back-office management tool for independent gas station and convenience store owners.**

> **Disclaimer:** OpenCStore is not affiliated with, endorsed by, or certified by Verifone, Gilbarco Veeder-Root, or any other POS vendor. POS integration features are adapters that work with exported files. No proprietary APIs or protocols are used.

---

## What It Does

OpenCStore Back Office gives small c-store operators a free desktop tool to:

- **Run daily and shift-level sales reports** without a cloud subscription
- **Audit PLU / item catalog data quality** — detect duplicate barcodes, wrong tax/age flags, blank descriptions, and more
- **Get pricing recommendations** based on configurable margin targets by department
- **Run shift-change and end-of-day checklists** with timestamped sign-off
- **Maintain a complete audit trail** of every action taken in the system
- **Work fully offline** — no internet connection required after installation

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm 9 or later

### Dev / Demo Setup

```bash
git clone <repo>
cd opencstore-backoffice
npm install
npm run dev
```

This starts the Electron app with the Vite development server.

> **If `npm install` fails compiling `better-sqlite3`** (seen on newer Node versions —
> e.g. Node 24 — that don't have a prebuilt binary yet): the app only ever needs
> `better-sqlite3` built for **Electron's** Node ABI, not the one running `npm install`,
> so the failing build attempt is for a target the app doesn't use. Work around it with:
> ```bash
> npm install --ignore-scripts
> npm rebuild electron
> npx electron-builder install-app-deps
> ```
> `--ignore-scripts` skips **every** package's install/postinstall scripts, not just
> `better-sqlite3`'s failing build — including Electron's own postinstall, which
> downloads its actual binary. Without `npm rebuild electron`, Electron fails to start
> with `Error: Electron failed to install correctly, please delete node_modules/electron
> and try installing again`. `npm rebuild electron` reruns just that one package's
> install script; `electron-builder install-app-deps` then rebuilds `better-sqlite3`
> against Electron's ABI (this pair also normally runs automatically via the
> `postinstall` script — but only when `npm install` exits cleanly, which it won't if
> the first attempt hard-fails on `better-sqlite3` before reaching it).

### Build Installer

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

Installer files are output to `release/`.

---

## First Run

On first launch, the **Onboarding Wizard** will walk you through:

1. Store name, address, timezone, and tax rate
2. POS integration type (start with **Demo mode** to explore)
3. Admin account creation (password stored locally, hashed with bcrypt)

---

## Module Guide

| Page | What You Can Do |
|------|----------------|
| **Dashboard** | Pending recommendations and audit flags, plus a Store Performance section: last received fuel price, Department/Merchandise/Fuel Sales and Fuel Volume charts by month, and a "Log Daily Sales" entry point |
| **Data Import** | Load sample data or import XML/CSV exports from your POS |
| **Inventory** | Track on-hand quantity and value per item; receive deliveries from vendors (updates cost + on-hand); log manual adjustments for shrink, waste, damage, and physical counts |
| **Lottery** | Track instant ticket games and physical books through their lifecycle (received → active → settled/returned); reconcile sales by recording a ticket count against each active book |
| **Time Clock** | Every employee clocks themselves in/out with an optional unpaid break; owners/managers see who's on the clock, correct entries (e.g. a forgotten clock-out), and run payroll hours/cost reports |
| **All Locations** | Only shown once you have more than one store: a side-by-side snapshot of every location you can access. Switch which store you're working in from the sidebar; owners add locations and grant other employees access from Settings |
| **Item Audit** | Run the PLU data quality engine; approve or reject each finding |
| **Pricing** | Run margin analysis; review and approve price change recommendations |
| **Reports** | Generate and archive 13 report types; export to CSV; print |
| **Operations** | Run shift-open, shift-close, and day-close checklists with sign-off |
| **Settings** | View store configuration and current user info; owners manage user accounts (create, reset password, deactivate) |
| **Audit Log** | Read-only, append-only record of every action taken |

---

## POS Integration

| Mode | Description |
|------|-------------|
| **Demo / Mock** | Built-in sample data; no POS needed |
| **File Import** | Select XML or CSV export files from your POS back-office (PLU/item catalog) |
| **Verifone Ruby2** | File import available; no direct API integration yet |
| **Commander — fuel prices/totals** | Real connection over Commander's NAXML API (see Settings → Fuel POS Connection). Read-only: live fuel prices, fuel totals, pump maintenance counters. |
| **Commander — PLU catalog** | Live sync via NAXML `vPLUs` ("Sync from Commander" on the Imports page), read-only, plus File Import as a fallback. Item-level tax/age-restriction flags aren't available from the live feed — review new items in Item Audit after syncing. |

> All write operations go through: **Backup → Dry-run validation → Owner approval → Export file → Manual POS import**.  
> Nothing is ever written to your POS automatically — except the Commander fuel connection's
> read-only price/totals lookups, which never write anything by design (see `docs/integration-notes.md`
> for the write methods that exist in code but are intentionally not wired to any button).

> **No live POS transaction feed.** There's no live register/transaction integration yet — the
> Dashboard's Department Sales and Merchandise Sales charts are fed by manually logging each day's
> department totals ("Log Daily Sales" on the Dashboard), and the Fuel Sales/Volume trend is built
> from periodically snapshotting Commander's live fuel totals into history (automatically once a day
> when the Dashboard loads, if connected). See `docs/integration-notes.md` for details.

---

## Data Storage

All data is stored locally in an SQLite database at:

| OS | Path |
|----|------|
| Windows | `%APPDATA%\opencstore-backoffice\opencstore.db` |
| macOS | `~/Library/Application Support/opencstore-backoffice/opencstore.db` |
| Linux | `~/.config/opencstore-backoffice/opencstore.db` |

Backups are stored in the `backups/` subdirectory of the same folder.

---

## Project Structure

```
opencstore-backoffice/
├── app/
│   ├── main/           Electron main process + IPC handlers
│   └── preload/        Context bridge (secure renderer↔main bridge)
├── src/                React + TypeScript frontend (Vite renderer)
│   ├── pages/           Page components (Dashboard, Onboarding, etc.)
│   ├── components/      Shared UI components
│   ├── modules/         Renderer-side service facades
│   └── styles/          Tailwind CSS
├── backend/
│   └── services/       DatabaseService, ImportService, ItemAuditService,
│                       PricingService, ReportService
├── database/
│   └── schema.sql      Full SQLite schema with all 25+ tables
├── integrations/
│   ├── AdapterInterface.ts  POS adapter contract
│   ├── adapters/       MockVerifoneAdapter
│   └── parsers/        XmlPluParser, CsvPluParser
├── audit/
│   └── AuditLogger.ts  Append-only audit log service
├── sample-data/        Mock XML + CSV files with intentional data issues
└── docs/               Architecture, assumptions, roadmap
```

---

## Security Notes

- Passwords are hashed with bcrypt (12 rounds) before storage
- No plaintext credentials are stored in the database
- The app runs fully offline — no data leaves your machine
- The preload/contextBridge pattern prevents renderer from accessing Node.js directly
- Content Security Policy is set on the main window

### Account recovery

Owners manage their team's accounts from **Settings → Users**: create a login, reset anyone's
password, or deactivate someone who's left. The app also won't let you deactivate the only
active owner account, so you can't lock yourself out that way.

If nobody can log in at all, the **"Forgot password?"** link on the sign-in screen resets a
password using your store's name (set during onboarding) plus an existing active username — no
recovery key or emailed link, since this app has no server to send one from. See
`docs/integration-notes.md` for the reasoning behind gating it on the store name specifically.

---

## License

MIT — free to use, modify, and distribute.
