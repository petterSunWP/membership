# Phase 1 Recipe Costing implementation plan

Implementation status: approved local setup, scoped backend APIs and staff React
management interface are implemented. Local unit, SQL/HTTP integration and render
tests pass. The implementation sequence below documents the approved approach;
manual staff user acceptance testing is now the remaining review step.

## Design decision

Follow Member2Go's logical relationship model. Every new table owns a primary
key. Relationship columns are ordinary IDs, supported by explicit indexes and
appropriate business-key uniqueness. No database-level relationship constraints
or cascading actions are introduced. Existing tables, primary keys and
relationships remain unchanged.

All 24 costing tables use their own unsigned BIGINT `id`. No setup ledger,
version-tracking table, runner or automatic startup DDL is introduced. Brand/location IDs, product/staff IDs,
material IDs, revision IDs, option IDs and unit codes remain logical links.
Unique keys still prevent duplicate codes, revisions, size variants and mapping
records. CHECK constraints still validate individual-row values such as positive
yields and explicit tax fields; they do not enforce cross-table relationships.

## Scope retained

- One existing Member2Go repository and the shared local `membership_dev` database.
- Distinct raw, prepared and packaging material kinds; final drinks are recipes.
- Entered material price, usable quantity/unit and explicit tax treatment only.
  Supplier packaging, procurement and inventory are excluded.
- Measured preparations may consume grams and produce millilitres. Only measured
  output establishes cost per output unit; mass and volume are never equated.
- Explicit formulations per size, topping portions and customisation effects.
- Exact decimal/rational calculations; compare GST-exclusive costs and revenue,
  explicitly normalizing inclusive retail prices without assuming import tax rules.
- Brand/location scope throughout, existing products linked without updates to
  membership, referral, points or order processing.

## Mandatory service-layer write contract (next implementation milestones)

Library, recipe and archive APIs now implement this service contract. These
relationships are enforced by backend transactions, not by the database schema.

1. Authenticate staff and resolve explicit costing access for the selected
   brand/location. Derive the author from the session, never a submitted ID.
2. Begin a transaction on one connection. Lock the brand then the location in
   deterministic order (`SELECT ... FOR UPDATE`). All costing write paths must
   follow this protocol; for Phase 1, the location lock serializes costing writes
   and avoids races between recipe edits and archiving dependency records.
   Global units remain immutable reference data with no editing endpoint.
3. Validate the brand and location exist, location belongs to brand, and both
   permit the requested operation. Verify access again within the transaction.
4. Fetch every submitted relationship ID and reject missing, archived or
   out-of-scope records before any insert/update. Use brand/location predicates
   in all scoped queries. For global products/staff/units, verify existence and
   required status, then check the module mapping/access record. Never infer
   ownership from a globally unique numeric ID alone.
5. Verify relationship-specific ownership:
   - Product links refer to an existing permitted product and the same scope.
   - Purchased prices belong only to RAW/PACKAGING materials, with compatible units.
   - A price head selects a price for that exact material and scope.
   - Preparation revisions belong to PREPARED materials. Inputs exist in the
     same scope; reject cycles, empty batches and incompatible input units.
   - Yield measurements belong to the selected preparation revision and match
     the prepared output's dimension. A preparation head selects its own material,
     revision and yield, never another preparation's measurement.
   - Recipe variants belong to the selected drink and size in the same scope.
     Product mappings and price-source/tax fields must be explicitly valid.
   - Revisions belong to the variant; lines belong to that revision. Recipe heads
     select only a revision of their own variant.
   - Options belong to their group; applicability and defaults belong to the
     variant. Effects target lines of the same variant/revision and valid
     materials. Enforce portions, selection limits and conflicting-effect rules.
6. Preserve immutable price/revision/yield history. Advance heads with optimistic
   row versions; reject stale updates. Write an audit record in the same transaction.
   Rebuild option effects when revision-specific line targets change.
7. Commit only after all validation succeeds; rollback the complete write on failure.
   Parameterize all values. Do not expose arbitrary SQL or bypass write services.

## Deletion and archiving

No hard-delete endpoints will be exposed for costing records/history in Phase 1.
Before any archive operation, acquire the same scope locks as recipe writes and
traverse the inverse dependency graph from all active current drink and
preparation revisions, including permitted toppings and customisation effects.
Reject archiving a required material, preparation, size, option/group, product
mapping, brand or location. Include transitive dependencies through nested
preparations; default selections alone are not sufficient. Return a dependency
conflict with the affected records and require users to revise active recipes
first. Use indexes on relationship IDs to support these checks.

Inactive historical revisions remain intact. A referenced historical record must
remain available for audit, even if it is no longer selectable for new recipes.
Products and staff are never deleted or archived through the costing module.

## Read-time integrity and boundaries

Build each calculation from one consistent, scoped database snapshot. Validate
logical links, ownership, status, units and graph cycles before resolving costs.
Missing or invalid dependencies make costing incomplete; never treat them as
free or return a plausible margin from an invalid graph.

With no database-enforced links, direct SQL or existing legacy tools can bypass
costing validation. This is an accepted boundary of the requested design:
all costing writes must use validated services, and reads must detect invalid
links. Do not change membership/order services to intercept unrelated operations.
Add an administrative integrity report for orphan links and scope mismatches in
later service work; it reports issues without silently repairing existing data.

## Implementation sequence and approval boundary

1. Current step: replace framework artifacts with two ordinary reviewed SQL files:
   `schema.sql` (24 CREATE TABLE statements) and `reference-data.sql` (essential
   reference inserts). Show the complete CREATE TABLE statements for approval.
   Do not execute SQL or begin the remaining API/UI work until approval arrives.
2. After explicit SQL approval, reverify the real local mysqld listener, TCP
   127.0.0.1:3306, database membership_dev and its previously verified server
   UUID/data directory before executing anything. Use existing backend credentials
   only in memory. Never start a tunnel or connect to production. Inspect any
   pre-existing costing objects and stop on incompatible definitions.
3. Execute the reviewed CREATE TABLE statements directly on that connection,
   followed by the reference-data script. Verify resulting definitions, indexes,
   reference values and absence of database-enforced relationship constraints.
   Existing membership, product, points, order, referral and staff records are
   never inserted, updated or deleted by setup. Do not run the legacy SQL dump.
4. Implement the service validation/transaction/dependency contract above and
   protected backend APIs for all three material libraries, preparations and
   yield observations, product mappings, size variants, options, cost previews,
   profitability and audit history. Reuse staff authentication and explicitly
   provision costing access for authorized staff without changing staff records.
5. Build management routes in membership-store, using the current store layout:
   Costing Overview, Raw Ingredients, Prepared Ingredients, Packaging & Supplies,
   Drink Recipes with sizes, and Toppings & Customisations. Keep forms simple;
   show entered price/usable quantity, measured yield and transparent cost totals.
   Keep technical revision details behind optional history views.
6. Test calculations, API authorization, scoped integrity, archive dependency
   protection, UI flows and price-change propagation locally. Test data writes
   are restricted to costing tables; existing products/staff are read-only
   references. Verify existing membership/order contracts remain unchanged.
7. Run backend and staff portal locally for user acceptance testing, give local
   URLs and a practical walkthrough, and resolve issues from that testing.
8. Production SQL execution, GitHub push and deployment are separate future
   tasks requiring explicit user approval after local acceptance.

No separate restore-test database, new account, grant changes or restore-proof
file is required. Retain the existing private local backup without modifying it.
SQL files contain no host/user/database selection or local server UUID, so they
can be reviewed and used in a future production setup separately. Local target
verification is a manual pre-execution check, not a migration framework.

## Verification plan

Current automated checks: 24 independent primary keys; no database relationship
clauses in any setup script; logical IDs and brand/location fields retained;
relationship lookup index coverage; additive statements and repeatable essential
seed; no ledger/runner or automatic setup entry point;
synthetic calculation cases for GST, units, yields, price changes and customisation.

Backend and UI integration tests must cover missing IDs, wrong owner/revision,
cross-brand/location links, inactive records, stale writes, missing units/prices,
preparation cycles, option conflicts, archive dependencies (including nested
preparations and optional toppings), and concurrent archive-versus-recipe writes.
Use synthetic fixtures, never production data or new records in legacy live
membership tables. Runtime relationship rejection tests belong to those services,
not tests expecting database constraint errors.
