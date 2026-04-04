# OpenCStore Back Office – Roadmap

## MVP (v0.1) – Current
- [x] SQLite schema (25+ tables)
- [x] Onboarding wizard
- [x] Local authentication (bcrypt)
- [x] POS adapter interface + mock adapter
- [x] XML PLU parser
- [x] CSV pricebook parser
- [x] Import service with backup-before-import
- [x] Item audit engine (15 rule codes)
- [x] Pricing recommendation engine (margin, price-ending, below-cost)
- [x] Approval workflow (approve / reject / export)
- [x] 13 report types with archiving
- [x] Shift-open, shift-close, and day-close checklists
- [x] Append-only audit log
- [x] Dashboard with alerts and quick actions
- [x] Sample data with intentional data quality issues

## v0.2 – Stability & Polish
- [ ] PDF export for reports (via electron print-to-PDF)
- [ ] Transaction CSV import (seed sales data)
- [ ] Full settings edit UI (store info, users, tax rates)
- [ ] Add/edit user accounts (manager and cashier roles)
- [ ] Batch approve/reject in item audit
- [ ] Export approved item changes to importable file
- [ ] Print-optimized daily close packet
- [ ] Over/short trend chart on dashboard
- [ ] End-to-end test suite

## v0.3 – Reporting Enhancements
- [ ] Weekly and monthly rollup reports
- [ ] Top-selling items chart
- [ ] Margin trend over time
- [ ] Cashier over/short history chart
- [ ] Recharts-based visual reports in-app
- [ ] Email/print report scheduling

## v0.4 – Inventory & Receiving
- [ ] Purchase order entry
- [ ] Vendor invoice import (PDF / CSV)
- [ ] Invoice line matching against PLU catalog
- [ ] Receiving entry with cost updates
- [ ] On-hand quantity tracking
- [ ] Out-of-stock alerts

## v0.5 – Fuel Module
- [ ] Fuel delivery / tank gauge entry
- [ ] Tank reconciliation (book vs. physical)
- [ ] Fuel grade margin analysis
- [ ] Fuel sales import from POS exports

## v0.6 – Multi-Store
- [ ] Store selection UI
- [ ] Cross-store reporting
- [ ] Shared PLU catalog with per-store price overrides
- [ ] Sync/export to central store

## v0.7 – POS Write-Back Integrations
- [ ] Verifone Commander ODBC adapter (read-only initially)
- [ ] Ruby2 file-system adapter (PLU XML import/export)
- [ ] Dry-run validation against live POS catalog
- [ ] Controlled write-back with rollback snapshot
- [ ] POS-specific logout/login notification

## v1.0 – Production Ready
- [ ] OS keychain credential storage
- [ ] Automatic encrypted backup to removable drive
- [ ] Installer with auto-update
- [ ] Windows/macOS/Linux signed builds
- [ ] Operator manual (PDF)
- [ ] Video walkthroughs

## Future / Community Ideas
- Lottery ticket reconciliation
- Lottery scan-in/scan-out tracking
- Employee scheduling
- Loyalty program reporting
- Vendor contact and delivery calendar
- Integration with accounting software (QuickBooks export)
- Mobile companion app for shift leads
- Regional tax table updates
