# Inventory v1 API

Staff bearer authentication and existing costing VIEWER/EDITOR/ADMIN location access.
Base: `/api/staff/inventory/brands/:brandId/locations/:locationId`.
Decimal quantities/prices and IDs are strings. GET responses use `{success:true,data}`;
validation errors use `{success:false,message}`. Ownership is checked by service;
no database foreign keys. Server configuration and actual identity are pinned to local development.

| Method | Path                           | Body / purpose                                                                                                           |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/staff/inventory/context` | Accessible brand/locations                                                                                               |
| GET    | `/items`                       | Catalog, balance (null = uncounted), pack specification, latest cost price, low-stock state                              |
| POST   | `/items`                       | `materialId?`, `code`, `name`, `kind: RAW/PACKAGING`, `baseUnit: g/ml/each`, `packText?`, `minimumQuantity?`             |
| GET    | `/items/:id`                   | Item, shared material, balance, immutable specification revisions, recent movements                                      |
| PATCH  | `/items/:id`                   | `version`, `packText?`, `minimumQuantity` (blank/null clears threshold)                                                  |
| POST   | `/items/:id/archive`           | `version`; rejects nonzero balances / active recipe dependencies                                                         |
| POST   | `/items/:id/movements`         | Fields below; creates balance + ledger atomically                                                                        |
| GET    | `/movements`                   | Latest 300 scoped movements with material names                                                                          |
| POST   | `/imports/parse`               | Raw XLSX body, XLSX MIME, <=3MB; parses only, editor required                                                            |
| POST   | `/imports/preview`             | `rows`, explicit `taxBasis`, `gstRate`, `syncPrices`, `mode`, `batchId`, `mappings`, `excludedCodes`; saves preview only |
| POST   | `/imports/:id/confirm`         | `{previewToken}` from preview; owned, non-stale preview; atomic confirmation, idempotent completed result                |

Movement: `action: RECEIPT/ISSUE/WASTE/COUNT/REVERSAL`, `date: YYYY-MM-DD`,
`reason`, stable `requestId`, `version: balance.row_version` (null if no baseline).
Quantity either `quantity` + compatible `unit` (g/kg/ml/l/each/dozen), or
`packCount` + current `specId`. COUNT is absolute observed stock; unknown baseline
produces OPENING. Other operations require an existing baseline. Reversal uses
`reversalId` instead of quantity, only for receipt/issue/waste, appending a compensating entry.
Retries with the same request ID return the original movement; changed payload returns 409.
No negative balance or fractional individual count. No backdating before latest observed movement.

Import row: `{row,code,name,kind,packText,amount,packages,totalText,date,notes}`.
Optional text fields use `""` for unknown. Row price is per entered pack specification,
not per remaining stock. `mappings` uses code → existing material ID or explicit `"new"`.
Same-code/different-name and same-name/different-code require confirmation. Existing names,
units and recipe relationships are preserved. Four entirely incomplete rows of current
workbook are skipped. `EXCLUSIVE` is the UI default confirmed for this workbook, but the API
requires an explicit selection; `gstRate` may be `"0"`.

Linked costing price writes reuse `/api/staff/costing/.../materials/:id/prices`.
When a compatible active inventory spec exists, pass `inventorySpecId`; server derives
price quantity/unit from it and rejects a stale ID. This does not use current balance.
Cross-dimension price synchronization is deferred, not guessed.

## Current-data price template

`GET /imports/template` returns an authenticated, scoped XLSX attachment
(`inventory-price-update.xlsx`, `Cache-Control: no-store`). It includes active
raw ingredients and packaging, including shared costing materials not yet linked
to stock. Archived records and prepared ingredients are excluded. Maximum 1,000 rows.
The Inventory sheet uses the nine English headers; an Instructions sheet explains editing.

Pack contents come from the current inventory specification, or the existing price
quantity when no specification is available. Existing labels are preserved where valid.
Prices are converted to GST exclusive and normalized to that pack quantity using exact
arithmetic, exported with up to eight decimal places. Unknown/incompatible/out-of-range
prices stay blank with a note. No mass/volume assumptions or stock-derived price denominators.

Pack Count, Total Counted Quantity and Count Date are intentionally blank. Thus editing
only prices and reimporting does not touch balances or stock movements. For unknown packaging
specifications, enter the actual pack contents with the price: `1each` for a single item,
or `100each` for a 100-item pack. Downloading performs no database writes.

## Dual-mode import contract (current)

Preview request adds `mode: "STOCKTAKE" | "RECEIPT"` (default STOCKTAKE).
RECEIPT requires `batchId` (delivery reference, <=80 characters, letters/numbers/dot/underscore/hyphen/slash).
Batch references are trimmed and case-insensitive within a brand/location. Use a real unique delivery
reference and reuse it for retries. A different reference represents a different delivery; the system
cannot identify the same physical delivery entered under a deliberately different reference.

Both modes parse Pack Count × Pack Contents, or Total Counted Quantity with a unit; the
quantity fields are mutually exclusive. Raw ingredients retain mass/volume dimensions; packaging
uses whole individual counts. `Count Date` is the stocktake/receipt movement date.

- STOCKTAKE sets entered stock, including explicit zero; it does not add the old balance.
- RECEIPT adds strictly positive incoming stock via the existing receipt movement implementation.
  An explicit zero receipt is a no-op for stock. Unknown opening stock blocks a positive receipt;
  record a Stocktake opening count (including zero) first.
- Blank quantities and omitted codes never affect stock. Blank prices never change prices.
- Price-only rows work in either mode only with `syncPrices:true`. Both blank, or a price-only
  row with synchronization disabled, produce SKIP without creating/changing specifications or catalogs.
- Entered prices are validated even when sync is off. An enabled price update without compatible
  pack contents is an ERROR, rather than partially applying a stock row and silently deferring price.
  Correct the row or explicitly turn off price sync and re-preview for a stock-only import.
- Unchanged price-only rows are SKIP. Changed prices append immutable history. Selected GST basis
  and rate are included in the preview and validated, including rate zero.

Preview returns `mode`, `batchId`, `previewToken`, import `id`, summary and plans. Plans include
`currentStock`, imported `stock`, `resultingStock`, `observedDate`, `changesStock`, `changesPrice`,
`currentPrice` and `nextPrice` (amount, quantity, unit, GST basis/rate), plus status and warnings.
Stock changes are expressed in canonical g/ml/each. Readiness is revalidated against the current
scope, item, balance, specification and price-head versions before any posting.

Confirmation must send the returned `previewToken` (required for receipts; supplied by the UI for
both modes). It is canonicalized across MySQL JSON key ordering. A changed pending preview or
intervening stock/price update returns 409 and requires a fresh preview.

### Atomicity and deduplication policy

No automatic partial import. Any ERROR blocks confirmation of the entire included batch. Staff may
explicitly list `excludedCodes`, refresh the preview and confirm the remaining READY rows together;
SKIP rows and exclusions are recorded in the batch payload. Duplicate codes/missing required code,
name/type or malformed overall input must be corrected in the workbook. Skipping does not permit
posting duplicated code rows. Balances, movements, new prices, specs and completion audit commit
in one existing scoped transaction; any failure rolls everything back.

No schema change. Existing `inventory_imports.id` is the import identifier; its JSON payload stores
mode, normalized delivery reference, input fingerprint, row dates, exclusions and preview snapshots.
For RECEIPT the scoped unique content_hash is derived solely from the batch reference, independently
of row order, quantity, prices or settings. Identical completed retries return the original result;
changed data/settings under a completed batch reference return 409. New delivery references are
required for new receipts. Old completed import records are never rewritten; absent legacy mode
means STOCKTAKE and original stocktake content hashes remain supported.

Existing movement request IDs `import:<id>:<code>` link immutable movements to the batch; the
movement reason includes the import ID and receipt reference, while `created_by` and observed_date
record operator and movement date. Price history notes carry the import/batch identifier.
