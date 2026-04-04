# Assumptions and Limitations

## Integration Assumptions

### Verifone Ruby2 / Commander
1. **No official API access assumed.** The `MockVerifoneAdapter` and `XmlPluParser` are approximations based on publicly observable file formats and common c-store data conventions — not based on proprietary SDK documentation.
2. **File-based export is the primary integration path for MVP.** Operators can export XML/CSV files from their POS back-office software and import them here.
3. **Write-back is file-export only.** The app exports an approved change file; the operator imports it into the POS manually. No direct network write to any POS is implemented.
4. **POS logout/login may be required.** After importing changes into the POS, a terminal reload is often required. The app warns the user.
5. **XML field names vary by site and version.** The `XmlPluParser` handles a range of common field name aliases (e.g., `Description`, `Name`, `Desc`). Operators with unusual exports may need custom parsing.

### Data Quality
6. **No external product database lookups.** Item name and classification recommendations are based on pattern matching against the local catalog only.
7. **Conexxus / NACS standards referenced informally.** Department/category naming rules are based on widely-observed convenience store merchandising practices, not an official Conexxus API or licensed data.
8. **Tax rates vary by jurisdiction.** Tax flag recommendations (e.g., tobacco, prepared food) assume common US c-store tax rules. Always verify with a tax professional.
9. **Age restriction rules are US-centric.** The app flags tobacco and alcohol items for age restriction based on common US state minimum purchase ages. Verify local regulations.

## Technical Assumptions

10. **Single-store, single-PC deployment for MVP.** No multi-store or multi-device sync is implemented.
11. **No concurrent database access.** The SQLite WAL mode is used for reliability, but simultaneous writes from multiple processes are not supported.
12. **better-sqlite3 is synchronous.** All database operations block the main process thread. For MVP data volumes (< 100,000 PLU items), this is acceptable.
13. **Electron security defaults.** `contextIsolation: true`, `nodeIntegration: false`. The preload script is the only bridge.
14. **No real-time POS event streaming.** Sales and shift data are imported from export files or loaded as static snapshots. Live transaction monitoring is a future capability.

## Security Assumptions

15. **Local use by trusted operators.** The app runs locally and is not exposed to a network. Authentication is a basic bcrypt-hashed local password store.
16. **No OS keychain used in MVP.** Connection settings are stored in the SQLite settings table with a note that production deployments should use OS keychain or encrypted storage. Connection passwords are not stored in MVP.
17. **Audit log integrity.** The audit_log table is never updated or deleted by application code. This relies on application-level enforcement — there is no row-level security in SQLite to enforce it at the DB layer.

## Known Limitations

| # | Limitation | Priority |
|---|-----------|---------|
| 1 | No live POS data connection (XML/CSV file import only) | High |
| 2 | No multi-store support | Medium |
| 3 | No PDF report generation (print via browser only) | Medium |
| 4 | No fuel reconciliation data in MVP (placeholder only) | Medium |
| 5 | No transaction import in MVP (reports show zero unless data seeded manually) | Medium |
| 6 | No EBT/WIC compliance checking | Low |
| 7 | No vendor invoice import or matching | Low |
| 8 | No inventory receiving or on-hand tracking | Low |
| 9 | No multi-user concurrent editing | Low |
| 10 | Settings editing requires re-running wizard | Low |
