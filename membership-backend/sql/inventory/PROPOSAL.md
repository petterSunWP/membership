# Inventory extension — implemented first version

Status: approved local implementation. Five new inventory tables were created in
verified local membership_dev, with no database foreign keys or changes to existing
tables/data. Existing 37 table schemas and 241 rows were verified unchanged at setup.
The reviewed workbook is not imported automatically. See [INVENTORY.md](../../../INVENTORY.md)
for current implementation, tests, running instructions and user acceptance checklist.

## One shared material catalog

Reuse existing costing_materials IDs, names, codes and unit dimensions as the
shared catalog. Do not create a second independent name/code catalog or remap
existing recipe lines. Inventory and costing screens select the same material.
The confirmed first version covers RAW materials and PACKAGING supplies, manual
receipts/issues/waste, counts, movement history and low-stock alerts. Prepared
batch production, sales-driven deductions and mass-to-volume conversion are
outside this first version.

An item's specification is not its stock balance. A price for a 1,000 g bag is
divided by 1,000 g even if only 600 g currently remain. Mass and volume are never
interchanged. Keep inventory quantities in canonical g/ml/each by dimension;
existing costing unit choices remain supported through compatible conversion.

## Additive tables

- inventory_items: own primary key, brand_id, location_id, material_id, current
  specification ID, minimum-stock quantity, status and optimistic row version.
  Unique brand/location/material relationship, with lookup indexes. An inventory
  item logically links to an existing shared raw/packaging material.
- inventory_item_specs: immutable specification revisions with item_id,
  usable_quantity, unit_code, optional label, recorded time and author. Supports
  a default specification without rewriting past prices when bag size changes.
- inventory_imports: owned preview payload, content fingerprint, completion result
  and idempotency state. Preview is separate from applying stock or price changes.
- inventory_balances: own primary key, brand/location/item, canonical base unit,
  nonnegative current quantity and row version. One balance per scoped item.
- inventory_movements: immutable stock ledger with item/scope IDs, signed base
  quantity change, before/after balances, event type, reason, staff author,
  request ID, recorded time and optional reversal link. Events include opening
  balance, receipt, manual issue, waste, physical-count adjustment and reversal.
  Reversals append compensating entries rather than altering ledger history.

All relationships use ordinary IDs and backend validation, not database-level
relationship constraints. Existing costing and Member2Go tables are not altered
by setup. Complete CREATE statements are in schema.sql and have been executed locally; there is no migration framework or production connection.

## Backend integrity and boundaries

Use existing staff authentication and scoped costing permissions, with current
active-staff checks. Validate material ownership, status, specification ownership
and unit dimensions. Lock the scope/item/balance consistently, reject negative
stock, and write balance plus ledger atomically on one connection. Unique scoped
request IDs make retries idempotent; return the original result for an identical
retry and reject reuse with different content. Stocktake records the difference
between the observed quantity and the locked current balance.

Reject archiving an item with nonzero stock or required active dependencies.
Maintain decimal-safe arithmetic and decimal strings; display two decimal places.
No stock is inferred from historical orders or price entries. Updating a price
alone does not receive stock. Existing order, referral, membership and points
logic remains untouched; no automatic order deductions are assumed.

## Costing integration

When a material has an active inventory specification, its price form displays
name/code/specification read-only and defaults the amount's usable quantity/unit
from that specification. The user normally enters only price; GST rate defaults
to 0.15 and remains editable, including zero. GST basis remains explicit (or
retains an already explicitly configured basis).

The backend resolves the selected specification in the same scoped transaction;
it must not trust a browser-provided quantity. Each new costing price still
stores its own usable quantity/unit snapshot in the existing price history.
A later specification edit must not silently reprice historical price records.
Unlinked existing costing materials retain the current manual-quantity workflow
until the user links/confirms their stock item and specification.

Existing external names/codes/specifications, if any, need the user's source
file/system location and an explicit field mapping. Do not invent pack sizes,
import stock balances as pack sizes, bulk overwrite records, or assume GST basis.

## Proposed management screens

Inventory Items (shared names/codes and pack specifications), Stock Overview
(balance, base unit and low-stock flag), Receive/Issue/Waste forms, Physical Count,
and Movement History. Start with manual stock changes; no automatic production
or sales consumption until its business trigger is explicitly defined.

## Verification before release

Test unit conversions and exact decimals; matching/mismatched scope and specs;
negative-stock prevention; duplicate request retries; receipt/issue/waste/count
balances; compensating reversals; concurrent stock updates; price normalization
from selected specification; and preservation of existing recipes/prices/orders.
Use local synthetic costing/inventory fixtures without modifying legacy records.

## Confirmed workbook rules for the initial implementation

The nine columns are 物料编码, 物料名称, 类型, 每包装含量, 每包装价格（NZD）,
包装数量, 实盘总量, 盘点日期, 备注. Types are 物料 and 包装. Source names,
codes, prices, count dates and zeroes were preserved in the review copy.

- For the supplied material rows, parse the pack specification and multiply by
  the supplied package count. For packaging, parse the explicit total directly;
  never interpret its total as units per purchased pack. Reject conflicting
  totals/package data rather than guessing which is authoritative.
- Normalize kg to g and L to ml; preserve g, ml and individual item counts.
  No kg/g-to-ml conversion or density assumption is permitted in this version.
- Blank stock is unknown: retain the catalog row, skip inventory initialization,
  and show not counted. Explicit zero is a known count, not a missing value.
  Require a baseline/explicit opening-zero confirmation before stock operations
  on a previously uncounted item.
- Blank prices are unknown, not free. Stock can be initialized without prices.
  Never infer a purchase-pack size from direct stock totals to calculate price.
- First import previews new rows, logical links, conflicts, skipped quantities,
  unknown prices and normalized stock before confirmation. Existing material
  names/units/recipes are not silently overwritten. A code links to one shared
  material record, not a duplicate costing catalog.
- Count imports establish opening balance for new items; subsequent counts append
  difference-adjustment movements, not additive receipts or history overwrites.
  Reject stale count dates that would silently erase newer stock movements.
  Normalize request content for idempotency so retries do not add stock twice.
- Price synchronization is optional and requires an explicit GST-inclusive or
  GST-exclusive selection. GST rate defaults to 0.15 and permits zero. Preserve
  already configured cost history and recipe units. If a kg-priced liquid is
  used in ml recipes, flag its unsatisfied mass/volume conversion and defer price
  synchronization without guessing a factor or blocking its mass-based stock.
- New shared catalog entries are allowed, but no physical balances or source prices
  are inferred for incomplete rows. Keep the known count date (2026-11-08) rather
  than replacing it with the upload date.

The approved scope is now implemented locally. No production access, push or deployment.
