# Sample Data

This directory contains sample/mock data files for development and demonstration.

## Files

| File | Description |
|------|-------------|
| `mock-plu.xml` | XML PLU export approximating common c-store POS back-office export structures |
| `mock-pricebook.csv` | CSV pricebook export with matching items |

## Data Quality Issues (intentional, for demo)

The sample data includes several intentional data quality issues that the Item Audit engine will detect:

| PLU | Issue | Rule Code |
|-----|-------|-----------|
| 9001 | Blank description, no UPC, no unit descriptor | BLANK_DESC, MISSING_UPC |
| 9002 | Duplicate description + duplicate UPC with 1001, wrong tax flag, missing age flag | DUPLICATE_UPC, DUPLICATE_DESC, WRONG_TAX_TOBACCO, WRONG_AGE_TOBACCO |
| 9003 | Energy drink in Grocery dept (wrong dept), inconsistent UOM lowercase, price below margin target | WRONG_DEPT_ENERGY, INCONSISTENT_UOM |
| 9004 | Price below cost | PRICE_BELOW_COST |
| 9005 | Missing UPC, short description too long | MISSING_UPC, ABBREV_TOO_LONG |

## Disclaimer

These files are entirely fictional sample data created for demonstration purposes.
Item descriptions and UPC codes are illustrative only and do not represent real
proprietary product data. Brand names are used only as realistic category examples.
