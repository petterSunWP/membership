# Recipe Costing API

Base: `/api/staff/costing`. Existing staff JWT Bearer authentication is required.
All scoped operations revalidate active staff and location-specific access in the
local database. VIEWER can read; EDITOR can write; ADMIN can grant staff access.
Only ADMIN can list existing staff or costing access entries.

Responses follow `{ success: true, data: ... }`, or
`{ success: false, message: ... }` with 401/403/404/409/422/500/503 status.
All IDs are strings; decimal amounts, quantities and GST rates are strings.
Integers such as versions, selection limits and portions are JSON numbers.

`GET /context` returns accessible locations (brandId, locationId, names, currency,
permission) and unit definitions. No access is granted automatically by this API.

Below, `S` means `/brands/:brandId/locations/:locationId`.

| Method/path | Purpose / payload |
| --- | --- |
| GET S/materials?kind=RAW&search=tea | Materials, current exclusive unitCost or costError |
| POST S/materials | `{ code, name, kind: RAW/PREPARED/PACKAGING, unit }` |
| GET S/materials/:id | Material, price history/head, preparation revisions/head, yields and current lines |
| PATCH S/materials/:id | `{ code, name, kind, unit, version }`; kind/unit immutable |
| POST S/materials/:id/prices | `{ amount, quantity, unit, taxBasis, gstRate, notes?, version? }`; version is current priceHead.row_version; omit only for first price |
| POST S/materials/:id/preparation | `{ lines, yieldQuantity, yieldUnit, instructions?, version? }`; version is preparation head version |
| POST S/materials/:id/yields | `{ revisionId, quantity, unit, notes?, select: boolean, version? }`; selection requires head version |
| PUT S/materials/:id/standard-yield | `{ measurementId, version }`; measurement must belong to current preparation revision |
| GET S/materials/:id/dependents | Active transitive preparations/drink dependencies, including customisations |
| POST S/materials/:id/archive | `{ version }`; blocks active dependencies |
| GET/POST S/sizes | Create `{ code, label, nominalVolume? }` |
| PATCH S/sizes/:id | Rename `{ name, previousName }` |
| GET/POST S/recipes | Create `{ name }` |
| GET S/recipes/:id | Drink, size variants, current lines/head and revision history |
| PATCH S/recipes/:id | Rename `{ name, version }` |
| POST S/recipes/:id/archive | `{ version }` |
| POST S/recipes/:id/variants | `{ sizeId, productId?, priceSource: PRODUCT/OVERRIDE, priceOverride?, taxBasis, gstRate }` |
| PATCH S/recipes/:id/variants/:variantId | Same payload plus variant `version` |
| POST S/variants/:id/revisions | `{ lines, version?, resetCustomisations?: boolean }`; version is recipe head version |
| GET/POST S/option-groups | Create `{ name, min, max }` |
| GET/POST S/options | Create `{ groupId, name, kind: TOPPING/SUGAR/ICE/SUBSTITUTION/OTHER }` |
| PATCH S/option-groups/:id or S/options/:id | Rename `{ name, previousName }` |
| GET S/variants/:id/options | Applicable groups/options and stored effect IDs |
| POST S/variants/:id/options | Attach `{ optionId, surcharge, taxBasis, gstRate, isDefault, maxPortions, effects }` |
| DELETE S/variants/:id/options/:attachmentId | Remove editable applicability/effects, retain definition/history and audit change |
| GET S/variants/:id/cost | Current cost with default options |
| POST S/variants/:id/cost-preview | `{ selections?: [{ attachmentId, portions }], lines?: [...] }`; unsaved lines cannot combine with saved customisation effects |
| GET S/profitability | Costs/errors per active drink size with defaults |
| GET S/products | Read-only existing active product catalog |
| GET S/staff | ADMIN: read-only active staff listing |
| GET/POST S/access | ADMIN: grant `{ staffId, permission: VIEWER/EDITOR/ADMIN }` to an existing staff account |
| GET S/audit | Latest 200 scoped change events |

Line shape: `{ materialId, quantity, unit }`. At least one, at most 100 lines.
Units: g, kg, ml, l, each, dozen. Cross-dimension conversions are rejected.
GST basis: INCLUSIVE or EXCLUSIVE, always explicit. Rate is a configured fraction
from 0 to 1 (for example `"0.15"`), never inferred from a price or product.

Effects:

- ADD: `{ operation: "ADD", materialId, quantity, unit }`
- REMOVE: `{ operation: "REMOVE", targetLineId }`
- REPLACE: `{ operation: "REPLACE", targetLineId, materialId, quantity, unit }`
- SET_QUANTITY: `{ operation: "SET_QUANTITY", targetLineId, quantity, unit }`

Targets are current saved recipe-line IDs. All ownership/scope/material checks
are performed in services before writes. Multiple selected effects on one target
are rejected; multiple portions require additive effects. Removing all ingredients
is not a valid recipe. Referenced history is immutable and has no delete API.

Cost results include `cost`, `revenue`, `grossProfit`, `marginPercent` (or null for
zero revenue), `breakdown`, `surchargeExclusive`, configured retail tax fields,
`calculatedAt` and `recipeRevisionId`. Amounts use eight decimal places and margin
four, rounded half away from zero only at output boundaries. Computation retains
exact fractions internally. Missing current costs or invalid links yield an
incomplete-cost response, never a zero ingredient-cost assumption.

All writes take costing brand/location locks in deterministic order on one
transaction connection. Updates with row versions reject stale values. No legacy
membership table is written and no global application database setting is changed.
