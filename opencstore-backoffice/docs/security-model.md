# Security Model

## Overview

OpenCStore Back Office is a desktop application that runs on a single machine inside
a store environment. The threat model focuses on:

1. **Unauthorized local access** — preventing non-owner staff from changing prices or exporting data
2. **Accidental data loss** — mandatory backups before any write-back operation
3. **Audit trail** — every action is recorded and cannot be altered after the fact
4. **POS write safety** — no accidental writes to the live POS system

---

## Authentication

### Password Hashing
- All passwords are hashed with **bcrypt** at cost factor **12**
- No plaintext passwords are stored anywhere in the database
- The `users` table stores only the bcrypt hash in the `password_hash` column

### Session Management
- Sessions are in-memory only (no persistent tokens written to disk)
- Session is lost on app restart — user must re-authenticate
- No "remember me" functionality (intentional for shared machine security)

### Login Rate Limiting
- After 5 consecutive failed attempts, the account is locked for 15 minutes
- Lockout state is stored in the `users` table (`locked_until` column)

---

## Role-Based Access Control

Three roles are supported:

| Role      | Description                             |
|-----------|-----------------------------------------|
| `owner`   | Full access to all features             |
| `manager` | Read/write most features, no settings   |
| `cashier` | Read-only, can open/close shifts        |

Permission checks use `can(role, permission)` from `src/modules/auth/roles.ts`.

### Permission Matrix

| Permission          | owner | manager | cashier |
|---------------------|-------|---------|---------|
| `items:read`        | ✓     | ✓       | —       |
| `items:write`       | ✓     | ✓       | —       |
| `pricing:read`      | ✓     | ✓       | —       |
| `pricing:write`     | ✓     | ✓       | —       |
| `pricing:apply`     | ✓     | —       | —       |
| `imports:run`       | ✓     | ✓       | —       |
| `reports:read`      | ✓     | ✓       | —       |
| `reports:export`    | ✓     | ✓       | —       |
| `shifts:manage`     | ✓     | ✓       | ✓       |
| `auditlog:read`     | ✓     | ✓       | —       |
| `settings:read`     | ✓     | ✓       | —       |
| `settings:write`    | ✓     | —       | —       |
| `users:manage`      | ✓     | —       | —       |

---

## Electron Context Isolation

The app uses Electron's **context isolation** model:

```
Renderer (React)
    ↓ window.electronAPI  (contextBridge)
Preload script
    ↓ ipcRenderer.invoke
Main Process (Node.js)
    ↓ ipcMain.handle
Services / SQLite
```

- `nodeIntegration: false` in the BrowserWindow options
- `contextIsolation: true` — renderer has no access to Node.js APIs
- `webSecurity: true` — no `file://` cross-origin access
- The `contextBridge` only exposes the specific IPC methods listed in `app/preload/index.ts`

This means even if the React renderer is compromised (e.g. by a malicious report definition),
it cannot access the filesystem, database, or network directly.

---

## Append-Only Audit Log

The `audit_log` table is **append-only**:

- Application code never issues `UPDATE` or `DELETE` on `audit_log`
- Every significant action writes a new row via `AuditLogger.log()`
- The log includes: action, entity_type, entity_id, user_id, detail, IP address (if applicable), timestamp

To verify integrity, an external backup comparison can be used. Future enhancement:
consider an HMAC chain over log rows.

---

## Backup-Before-Write

Every operation that modifies POS data follows this protocol:

```
1. User initiates change (pricing apply, import, etc.)
2. ConfirmDialog is shown with backup warning
3. BackupService.createBackup() is called
4. Backup status is checked — abort if backup fails
5. Change is applied
6. Audit log entry written
```

This is enforced in the application layer. See `backupRequiredMessage()` in
`src/modules/imports/backup.service.ts` for the user-facing explanation text.

---

## Database Security

- SQLite database file is stored in the Electron `userData` directory (OS-protected)
- WAL (Write-Ahead Logging) mode enabled for crash safety
- No network-accessible database port — SQLite is file-only
- Database is not encrypted at rest (future enhancement: SQLCipher)

### Sensitive Data
- No payment card data (PCI scope avoided entirely)
- No customer PII stored
- Fuel prices and cost data are considered confidential — restrict access to `manager`+ roles

---

## Input Validation

- All user input entering the database goes through parameterized `better-sqlite3` queries
- No string interpolation in SQL — SQL injection is not possible via the IPC layer
- The `validation.ts` library validates form inputs on the renderer side as a UX aid
- The main process validates all IPC payloads before passing to service methods

---

## Known Limitations / Future Work

| Item                        | Status     | Notes                                              |
|-----------------------------|------------|----------------------------------------------------|
| Database encryption at rest | Not done   | Consider SQLCipher for high-security deployments   |
| Audit log HMAC chain        | Not done   | Prevents retroactive log tampering                 |
| TLS for Commander adapter   | Planned    | Required when Commander adapter is implemented     |
| OS keychain for credentials | Not done   | Adapter credentials should use OS keychain         |
| Multi-store / network mode  | Out of scope | This is a single-machine desktop app             |
