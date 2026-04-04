# Test Plan – OpenCStore Back Office MVP

## Test Environment
- OS: Windows 10/11, macOS 13+, Ubuntu 22.04
- Node.js: 18+
- Database: SQLite (local file)

---

## 1. Onboarding

| # | Test | Expected |
|---|------|---------|
| 1.1 | Launch app for first time | Onboarding wizard appears |
| 1.2 | Complete wizard with valid data | Dashboard opens, store + user created |
| 1.3 | Submit wizard with blank store name | Validation error shown |
| 1.4 | Submit with password < 8 chars | Validation error shown |
| 1.5 | Submit with mismatched passwords | Validation error shown |
| 1.6 | Relaunch after completing wizard | Login page appears (not wizard) |

## 2. Authentication

| # | Test | Expected |
|---|------|---------|
| 2.1 | Login with correct credentials | Dashboard shown |
| 2.2 | Login with wrong password | Error message shown, audit entry created |
| 2.3 | Login with unknown username | Error message shown |
| 2.4 | Sign out | Login page shown |

## 3. Data Import

| # | Test | Expected |
|---|------|---------|
| 3.1 | Click "Load Sample Data" | Import job created, departments/categories/PLU items populated |
| 3.2 | Re-import sample data | Items updated, not duplicated |
| 3.3 | Import `mock-pricebook.csv` | Items imported, scan codes linked |
| 3.4 | Import `mock-plu.xml` | Full PLU tree imported |
| 3.5 | Import invalid XML | Error recorded in import job, user sees error message |
| 3.6 | Check import history | All jobs listed with counts |
| 3.7 | Verify backup manifest created | Backup entry exists for each import |

## 4. Item Audit

| # | Test | Expected |
|---|------|---------|
| 4.1 | Run audit after sample data import | Recommendations generated (min 8 for sample data) |
| 4.2 | Check for BLANK_DESC rule | PLU 9001 flagged |
| 4.3 | Check for DUPLICATE_UPC | PLU 9002 flagged |
| 4.4 | Check for WRONG_AGE_TOBACCO | PLU 9002 flagged |
| 4.5 | Check for PRICE_BELOW_COST | PLU 9004 flagged |
| 4.6 | Check for ABBREV_TOO_LONG | PLU 9005 flagged |
| 4.7 | Approve a recommendation | Status changes to 'approved', row removed from pending list |
| 4.8 | Reject a recommendation | Status changes to 'rejected', row removed |
| 4.9 | Approve with note | Note stored in review_notes field |
| 4.10 | "Approve All Shown" button | All visible recs approved |
| 4.11 | Filter by rule code | Only matching rules shown |

## 5. Pricing

| # | Test | Expected |
|---|------|---------|
| 5.1 | Run pricing analysis | Recommendations generated |
| 5.2 | PLU 9004 (price below cost) | PRICE_BELOW_COST rule triggered, suggested price > cost |
| 5.3 | Item with bad price ending | BAD_PRICE_ENDING rule triggered |
| 5.4 | Approve price rec | Status → 'approved', row shows green background |
| 5.5 | Reject price rec | Row removed from list |
| 5.6 | Export approved prices | Export file created, price_change_history records created |
| 5.7 | Export with zero approved | Alert "no approved recommendations" shown |

## 6. Reports

| # | Test | Expected |
|---|------|---------|
| 6.1 | Generate sales_by_dept report | Report rendered in table |
| 6.2 | Generate margin_report | Items listed with margin % |
| 6.3 | Generate item_compliance report | Counts of issues shown |
| 6.4 | Change date range | Report regenerated for new range |
| 6.5 | Export CSV | CSV file downloaded |
| 6.6 | Print button | Browser print dialog triggered |
| 6.7 | Report archived | Entry appears in Archive tab |
| 6.8 | View archived report | Saved data rendered correctly |

## 7. Operations / Checklists

| # | Test | Expected |
|---|------|---------|
| 7.1 | Create shift_close checklist | Steps populated |
| 7.2 | Complete each step | Step marked complete, timestamp recorded |
| 7.3 | Complete step with cash amount | Numeric value stored |
| 7.4 | Finalize after all steps done | Checklist marked complete |
| 7.5 | Enter over/short amount | Stored, shown in history |
| 7.6 | View history | Completed checklists listed |
| 7.7 | Create day_close checklist | Different step set shown |

## 8. Audit Log

| # | Test | Expected |
|---|------|---------|
| 8.1 | Login creates audit entry | 'auth/login' entry present |
| 8.2 | Import creates audit entries | 'import/started' + 'import/completed' entries |
| 8.3 | Approve recommendation creates entry | 'recommendation/item_approved' entry |
| 8.4 | Failed login creates failure entry | Entry with result='failure' |
| 8.5 | Filter by event type | Only matching entries shown |
| 8.6 | Pagination works | Next/prev page buttons work |

## 9. Security

| # | Test | Expected |
|---|------|---------|
| 9.1 | Password stored as bcrypt hash | No plaintext in DB |
| 9.2 | CSP headers set on window | Verified in DevTools |
| 9.3 | renderer cannot access `require` | Error if attempted |
| 9.4 | Audit log has no UPDATE/DELETE | Only INSERT in app code |

## 10. Edge Cases

| # | Test | Expected |
|---|------|---------|
| 10.1 | Dashboard with no data | Friendly empty state, no errors |
| 10.2 | Reports with no transactions | Empty table shown, not crash |
| 10.3 | Run audit with no PLU items | "0 items analyzed" message |
| 10.4 | Import same file twice | Idempotent (no duplicates) |
| 10.5 | DB file missing at startup | Error handled gracefully |
