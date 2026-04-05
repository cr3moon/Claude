# Integration Notes

## POS Adapter Architecture

OpenCStore Back Office uses an **adapter pattern** to isolate all POS-specific logic behind a
common interface (`IPosAdapter`). This means the core application never talks directly to any
POS hardware or protocol — it only calls adapter methods.

---

## IPosAdapter Interface

Every adapter must implement:

| Method             | Description                                                        |
|--------------------|--------------------------------------------------------------------|
| `connect(config)`  | Authenticate / open a connection. Returns `ConnectionResult`.      |
| `disconnect()`     | Cleanly close the connection.                                      |
| `readPluItems()`   | Fetch the full PLU/item list from the POS.                         |
| `backup(dest)`     | Create a point-in-time backup of POS data.                         |
| `validateChanges(changeSet)` | Dry-run validation without writing anything.           |
| `applyChanges(changeSet)`    | Write approved changes to the POS (after backup).      |
| `capabilities()`   | Describe what this adapter supports (read-only, backup, etc.).     |

Return types are defined in `src/modules/integrations/types.ts`.

---

## Available Adapters

### 1. `mock_commander` (MockCommanderAdapter)

**Purpose:** Development, demos, onboarding, and testing.

- Source: `src/modules/integrations/mock-commander.adapter.ts`
- Reads from bundled `sample-data/sample-plu.xml`
- Simulates realistic network delays (200–800ms)
- Always returns `readOnly: true` in capabilities
- `applyChanges` logs calls but does NOT write anywhere
- Safe to use in production for a "view-only" setup

### 2. `file_import` (FileImportAdapter)

**Purpose:** Manual import from XML or CSV POS exports.

- Source: `src/modules/integrations/file-import.adapter.ts`
- Reads XML PLU exports (`xml_plu` format) or CSV pricebook files (`csv_pricebook`)
- `applyChanges` exports an approved-changes JSON file for manual re-import
- No live connection to POS hardware required
- Suitable for stores that export a PLU file nightly

### 3. `commander` (CommanderAdapter) — **PLACEHOLDER**

**Purpose:** Future direct integration with Verifone Commander.

- Source: `src/modules/integrations/commander.adapter.ts`
- **ALL methods return `success: false` with "not yet implemented" messages**
- See TODO comments in the file for implementation requirements
- Do NOT use in production — this adapter cannot read or write POS data

---

## Adding a New Adapter

1. Create `src/modules/integrations/my-adapter.adapter.ts`
2. Implement the full `IPosAdapter` interface
3. Register it in `src/modules/integrations/adapter-factory.ts`:
   ```typescript
   REGISTRY['my_adapter'] = MyAdapter;
   ```
4. Add `'my_adapter'` to the `AdapterType` union in `types.ts`
5. Add a user-friendly label to the onboarding page (`OnboardingPage.tsx`)

---

## Backup-Before-Write Contract

Every adapter that implements `applyChanges` **MUST** be called only after the application has:

1. Created a `backup_manifest` record (via `BackupService`)
2. Confirmed the backup `status` is `'complete'`
3. Displayed a user confirmation dialog

This is enforced in the application layer, not the adapter. The `Commander` adapter placeholder
reminds implementers of this contract with explicit TODO comments.

---

## Security Considerations

- The Electron `contextBridge` ensures the renderer process cannot call Node.js APIs directly.
- All adapter code runs in the **main process** (`app/main/index.ts`).
- The renderer only calls IPC handles via `window.electronAPI`.
- Adapter credentials (if any) should be stored in the OS keychain, not the SQLite database.
- The `app_settings` table stores `adapter_type` only — never credentials.

---

## Verifone Ruby2 / Commander Notes

The Commander system uses proprietary TCP/IP protocols. Key implementation notes for when
the `commander` adapter is built:

- Default port: **9000** (configurable)
- Authentication: username + password over TLS
- PLU read: batch request, response is XML
- PLU write: individual item transactions with acknowledgment
- Backup: Commander has a native backup API (`/api/v1/backup`)
- Rate limit: no more than 50 writes per second recommended
- Test environment: Verifone provides a Commander simulator (ask your distributor)

Contact Verifone partner support for SDK access and protocol documentation.
