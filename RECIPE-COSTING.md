# Recipe Costing Phase 1 — local review

Implemented in the existing Member2Go repository and local membership_dev database.
Ready for staff user acceptance testing; no GitHub push or production deployment.

## Open locally

- Staff portal: http://localhost:5174/costing
- Existing staff sign-in: http://localhost:5174/login
- Backend: http://localhost:3000

Sign in using Peter Sun's existing staff login. Staff ID 1 has user-approved
costing ADMIN access for TEA TALK / Westgate. Only costing access/audit records
were added; the staff account, password and MySQL grants were not changed.
Normal staff authentication is required; there is no test login or bypass.

If the processes are stopped, start them in separate terminals:

```sh
cd membership-backend
npm run dev
```

```sh
cd membership-store
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

The staff frontend's existing API configuration points at the backend. The
costing database pool refuses a host/user/database other than the approved local
127.0.0.1:3306 membership_dev target and verifies the previously observed server
UUID/data directory. Existing configured secrets are used only in memory.
Production enablement is a separate future task.

## What is implemented

- Raw ingredients and packaging/supplies: create, rename/code edits, entered
  price with usable quantity/unit, immutable price history, current unit cost,
  active dependency lookup and guarded archive.
- Prepared ingredients: versioned batch formulations, independent input/output
  units, measured output yields, observation history and explicit standard yield
  selection. Nested preparations and cycle validation are supported.
- Drink recipes: create/rename/archive, independent formulations for each size,
  read-only existing-product mappings, existing product price or costing-only size
  price, formulation history, packaging lines and a transparent cost breakdown.
- Toppings/customisations: selection groups and named options, size applicability,
  explicit recipe additions/removals/replacements/quantity changes, default
  options, allowed portions and separately configured surcharges. Multiple
  portions are supported for additive toppings only.
- Profitability: GST-exclusive ingredients/packaging cost and revenue, gross
  profit and margin. Inclusive input prices are normalized only using their
  explicitly supplied GST basis/rate. Zero revenue has an undefined margin.
- Current costs are recomputed from one database snapshot, using exact rational
  arithmetic. Price/yield changes affect dependent calculations on the next
  request; management pages refresh after saves and on window focus. There is
  no background inventory process or cross-request cost cache.
- Scoped VIEWER/EDITOR/ADMIN access, current active-staff checks, audit history,
  optimistic versions and transaction/scope locks for costing writes.
- Staff management UI: Overview, Raw Ingredients, Prepared Ingredients,
  Packaging & Supplies, Drink Recipes, Toppings & Customisations and Staff Access.

No inventory, supplier purchasing, member, referral, points or order logic was
added or changed. All cross-record relationships are validated in services;
there are no database-level foreign key constraints or cascading actions.
No hard-delete APIs exist for materials, drinks or historical price/yield/revision
records. Removing an attached option deletes only that size's editable option
association/effects and creates an audit event; its shared option definition is
retained.

## Practical acceptance checklist

All example values below are synthetic, explicitly configured test inputs rather
than advice about the tax treatment of actual business purchases.

1. Sign in as Peter. Open Recipe Costing and confirm TEA TALK / Westgate, ADMIN.
2. Raw Ingredients: add `UAT-TEA`, name "UAT tea leaves", unit g. Enter price
   12.00 for 100 g, GST exclusive, GST rate 0.15. Expected unit cost: 0.12/g.
3. Packaging: add `UAT-CUP`, name "UAT cup", unit each. Enter price 11.50 for
   100 each, GST inclusive, rate 0.15. Expected exclusive unit cost: 0.10/each.
4. Prepared Ingredients: add `UAT-BREW`, name "UAT prepared tea", output ml.
   Enter 100 g UAT tea leaves as its batch input and an actual measured usable
   output of 2,400 ml. Expected output unit cost: 0.005/ml. Grams have not been
   converted to ml; total input cost is divided by measured output.
5. Drink Recipes: create Medium (code M) in Manage sizes. Create "UAT tea" and
   add its Medium variant. Use costing-only selling price 11.50, GST inclusive,
   rate 0.15. This changes no existing product price. Alternatively, link an
   existing product and explicitly configure that product price's GST basis.
6. Save 400 ml prepared tea plus one cup as its formulation. Calculate:
   recipe cost 2.10, exclusive revenue 10.00, gross profit 7.90, margin 79%.
7. Add a Large variant with a different formulation (e.g. 600 ml plus one cup)
   and independently configured selling price. Confirm quantities are not scaled
   automatically. Existing products can be mapped without changing their records.
8. Change tea leaves' entered price to 24.00 for 100 g (same exclusive basis).
   Recalculate Medium: cost 4.10, gross profit 5.90, margin 59%. Price history
   retains both records; no recipe edits should be necessary.
9. Record another yield of 2,000 ml without selecting it as standard. Costs must
   remain unchanged. Then explicitly select it: Medium costs 4.90, margin 51%.
10. Toppings & Customisations: create a group "Extra tea", minimum 0 / maximum 1,
    then a topping option. Attach it to Medium, add 100 ml prepared tea, surcharge
    1.15 inclusive with rate 0.15, maximum portions 2. With the selected 2,000 ml
    standard yield, one portion costs 6.10, exclusive revenue 11.00. Two portions
    cost 7.30, exclusive revenue 12.00. Confirm defaults and selection limits.
11. Try a non-additive option such as setting the original tea line to 200 ml.
    Target its current formulation line explicitly. Selecting conflicting changes
    to the same line must fail with an explanation.
12. Try archiving tea leaves, prepared tea or the cup while still required by
    active recipes/preparations/options. It must be blocked. Unused materials can
    be archived; their history remains. Archived materials cannot be newly used.
13. Try a zero yield, incompatible ml/g conversion, missing tax basis, duplicate
    code, stale version or wrong-scope ID. The backend must reject invalid input.
14. Review Overview and recent change history. Staff Access can grant existing
    staff a scoped viewer/editor/admin permission without editing staff records.
    A viewer can inspect costs but cannot write costing data.
15. Return to Customers, Orders and Redemptions to inspect existing screens.
    Do not create new orders or points records merely to test costing.

## Tests and build results

```sh
cd membership-backend
npm run test:costing
npm run test:costing:local
npm run build
```

```sh
cd membership-store
npm run test:costing
npm run build
npm run lint
```

- Backend unit/schema/input validation: 19 passing tests.
- Local HTTP/MySQL integration: 13 passing scenarios (14 TAP results including
  the parent test). Fixtures use one private transaction with savepoints and
  outer rollback; no synthetic costing records or staff grants persist.
- Frontend: 5 passing server-render/client-contract tests, with synthetic data.
- Backend and staff portal builds passed. Staff lint has zero errors and five
  existing hook-dependency warnings in unchanged membership pages.
- Live context/materials/profitability endpoints and portal: HTTP 200; configured
  CORS origin is http://localhost:5174.
- Browser verified the existing sign-in page. Authenticated click-through and
  actual operational data entry remain part of user acceptance testing; no staff
  password was reset or guessed to automate that login.

## Data preservation evidence

Local setup created exactly 24 costing tables with zero foreign keys and the
one brand, one location and six units. Peter's explicitly approved costing access
and its audit event are the only extra persistent setup records. No demo materials
or recipes remain after automated tests.

All original 13 tables and all 173 rows were fingerprinted before setup and after
implementation. Definitions and every row value match. Private evidence is stored
in the git-ignored .local-backups directory; no database contents/secrets are in
source control. No existing table, primary key or relationship was altered.

## Files and API guide

- `membership-backend/sql/costing/`: plain reusable setup SQL and design notes.
- `membership-backend/src/costing/`: local connection guard, decimal arithmetic,
  validation, transactional services and isolated Express routes.
- `membership-backend/tests/costing/` and `tests/local/`: automated checks.
- `membership-backend/src/app.ts`: only adds the costing router mount/import.
- `membership-store/src/costing/`: typed API client, scoped pages/forms and CSS.
- `membership-store/src/App.tsx` and `components/Sidebar.tsx`: new staff route/link.
- Both package.json files: test scripts only; no new runtime dependencies.

API contract: [membership-backend/src/costing/API.md](membership-backend/src/costing/API.md).

## Practical boundaries

Libraries currently return up to 1,000 rows and audit history up to 200 events.
Size/option metadata supports creation and renaming; selection rules and option
kinds are configured at creation. There are no destructive metadata cleanup APIs.
After revising formulation lines that have customisation effects, explicitly
confirm and rebuild those effects: they target specific revision line IDs.

Costing excludes labour, rent, payment fees and other overheads. No stock tracking,
bulk import, supplier workflows, production deployment or data migration framework
is included. Adding other brands/locations and initial administrative grants is
an explicit administrative setup task; the UI can switch among granted scopes.


Production release preparation now supports an explicit COSTING_DB_MODE=production policy
using existing DB_* settings and a verified database/server UUID. Local mode retains
the original local identity checks. See [RELEASE-COSTING-INVENTORY.md](RELEASE-COSTING-INVENTORY.md)
for the approved manual Git pull / additive SQL / environment / restart workflow.
The user will upload the real Excel again on production; local records are not migrated.
