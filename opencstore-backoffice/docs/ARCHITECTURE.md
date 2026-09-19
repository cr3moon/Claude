# OpenCStore Back Office – Architecture Document

## Overview

OpenCStore Back Office is a single-user desktop application built with Electron, React, and SQLite. It is designed to run entirely on a store PC with no cloud dependency.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Shell                              │
│  ┌──────────────────────┐    ┌───────────────────────────────┐  │
│  │   Renderer Process   │    │       Main Process            │  │
│  │   (React + TS)       │◄──►│  (Node.js + better-sqlite3)  │  │
│  │                      │IPC │                               │  │
│  │  ┌────────────────┐  │    │  ┌─────────────────────────┐ │  │
│  │  │ React Router   │  │    │  │  DatabaseService        │ │  │
│  │  │ Pages/Components│  │    │  │  ImportService          │ │  │
│  │  │ Tailwind CSS   │  │    │  │  ItemAuditService       │ │  │
│  │  └────────────────┘  │    │  │  PricingService         │ │  │
│  │                      │    │  │  ReportService          │ │  │
│  │  Context Bridge      │    │  │  AuditLogger            │ │  │
│  │  (preload/index.ts)  │    │  └─────────────────────────┘ │  │
│  └──────────────────────┘    │                               │  │
│                              │  ┌─────────────────────────┐ │  │
│                              │  │  Integration Layer       │ │  │
│                              │  │  ┌───────────────────┐  │ │  │
│                              │  │  │ IPosAdapter       │  │ │  │
│                              │  │  │ (interface)       │  │ │  │
│                              │  │  ├───────────────────┤  │ │  │
│                              │  │  │ MockVerifone      │  │ │  │
│                              │  │  │ Adapter           │  │ │  │
│                              │  │  ├───────────────────┤  │ │  │
│                              │  │  │ XmlPluParser      │  │ │  │
│                              │  │  │ CsvPluParser      │  │ │  │
│                              │  │  └───────────────────┘  │ │  │
│                              │  └─────────────────────────┘ │  │
│                              │                               │  │
│                              │  ┌─────────────────────────┐ │  │
│                              │  │  SQLite Database         │ │  │
│                              │  │  (better-sqlite3)        │ │  │
│                              │  └─────────────────────────┘ │  │
│                              └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Electron + React + SQLite
- **Electron** provides a native desktop window, file system access, and OS keychain access without requiring a web server
- **React + TypeScript** with React Router gives a SPA-style navigation experience
- **better-sqlite3** is used synchronously (no async) for reliable, crash-safe database access
- **Tailwind CSS** provides a clean, utility-first styling system without a complex component library

### 2. IPC Architecture
The renderer process has NO direct Node.js access. All privileged operations go through:

```
Renderer (React) → contextBridge.exposeInMainWorld → ipcRenderer.invoke → ipcMain.handle → Main Process
```

This satisfies Electron security best practices (contextIsolation ON, nodeIntegration OFF).

### 3. Integration Adapter Pattern
POS integration is abstracted behind the `IPosAdapter` interface:

```typescript
interface IPosAdapter {
  connect()
  testConnection()
  backup()
  exportData()
  parseFile()
  validateChanges()   // dry-run
  applyChanges()      // requires backup confirmation + approval
  logoutNotice()
  disconnect()
}
```

This allows:
- Adding new POS adapters without changing application logic
- Running in mock/demo mode without any POS
- Clear separation between "read" and "write" operations
- Write operations always require: backup → validate → approve → export

### 4. Change Management Flow
No POS data is ever modified without explicit approval:

```
Import / Analysis
       ↓
Recommendations Generated (status: 'pending')
       ↓
Owner Reviews Each Recommendation
       ↓
Approved (status: 'approved') or Rejected (status: 'rejected')
       ↓
Export to File (JSON/CSV)
       ↓
Owner manually imports file into POS back-office
       ↓
POS logout/login may be required
```

### 5. Audit Trail
The `audit_log` table is append-only. Application code never issues UPDATE or DELETE on this table. Every significant action creates a timestamped, immutable record with before/after state snapshots where applicable.

### 6. Data Safety
- A backup manifest entry is created before every import
- Original source files are preserved
- Rollback snapshots are stored with price change history
- No source data is overwritten without keeping the previous version

## Database Schema Overview

```
stores ──── users ──── user_sessions
  │
  ├── connection_settings
  ├── backup_manifest ──── import_jobs
  │
  ├── departments ──── categories ──── plu_items ──── scan_codes
  │                                         │
  │                                         └── pricebook_entries
  │
  ├── pos_cashiers ──── shifts
  │                        │
  │                        ├── transactions ──── transaction_items
  │                        ├── fuel_sales
  │                        └── tenders
  │
  ├── item_recommendations ──────────────────────────────────┐
  ├── pricing_recommendations ──── price_change_history      │
  │                              └── approval_queue ─────────┘
  │
  ├── shift_checklists ──── checklist_steps
  │
  ├── reports_archive
  ├── daily_close_packets
  ├── audit_log
  └── app_settings
```

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `backend/services/DatabaseService` | SQLite connection, schema init, generic CRUD helpers |
| `backend/services/ImportService` | Orchestrate backup + import, persist normalized data |
| `backend/services/ItemAuditService` | Rule-based PLU data quality analysis |
| `backend/services/PricingService` | Margin + price-ending recommendation engine |
| `backend/services/ReportService` | Report generation and archiving |
| `audit/AuditLogger` | Append-only audit log writes |
| `integrations/AdapterInterface` | TypeScript contract for all POS adapters |
| `integrations/adapters/MockVerifoneAdapter` | Demo adapter, ships sample data |
| `integrations/parsers/XmlPluParser` | Parse XML PLU export files |
| `integrations/parsers/CsvPluParser` | Parse CSV pricebook / PLU files |
| `app/main/index.ts` | Electron main process, IPC handler registration |
| `app/preload/index.ts` | Context bridge – exposes electronAPI to renderer |
| `src/` | React frontend, all UI components |

## User Roles

| Role | Permissions |
|------|------------|
| **owner** | Full access. Can approve all recommendations, change settings, export write-back plans |
| **manager** | Reports, checklists, view recommendations; cannot approve write-back |
| **cashier** | Operational checklists only |
