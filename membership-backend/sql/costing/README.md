# Recipe Costing: reviewed SQL setup

Status: approved and executed on the verified local membership_dev database.
Exactly 24 costing tables and essential reference rows were created. Final
fingerprints confirm all original 13 schemas and 173 rows are unchanged.
No foreign keys, ledger, runner or production setup were introduced.

Phase 1 APIs and management screens are implemented. See the repository-level
[RECIPE-COSTING.md](../../../RECIPE-COSTING.md) for local URLs, tests and UAT.

## Setup files

- [schema.sql](schema.sql): the complete 24 CREATE TABLE definitions.
- [reference-data.sql](reference-data.sql): insert only missing TEA TALK, Westgate,
  and six unit definitions, in one transaction.
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md): service validation, APIs,
  management interface, local testing and user acceptance sequence.

These are plain SQL files, not migrations. There is no migration ledger, runner,
framework, automatic startup SQL or package setup hook. The earlier unexecuted
migration artifacts, runner tests and restore-permission instructions have been
removed. The independent exact-arithmetic costing engine and tests are retained.
The existing ignored private local backup remains unchanged. A separate restore
database or permission change is no longer part of the workflow.

## Proposed CREATE TABLE inventory

Every name below includes the `costing_` prefix in schema.sql. Each table has
its own unsigned BIGINT, auto-increment primary key `id`.

| Purpose | Tables |
| --- | --- |
| Scope and staff access | `costing_brands`, `costing_locations`, `costing_staff_access` |
| Units and existing product mapping | `costing_units`, `costing_product_links` |
| Raw/prepared/packaging materials and entered prices | `costing_materials`, `costing_material_prices`, `costing_material_price_heads` |
| Preparation definitions and actual yields | `costing_preparation_revisions`, `costing_preparation_lines`, `costing_yield_measurements`, `costing_preparation_heads` |
| Drink sizes and final recipes | `costing_sizes`, `costing_drink_recipes`, `costing_recipe_variants`, `costing_recipe_revisions`, `costing_recipe_lines`, `costing_recipe_heads` |
| Toppings and customisations | `costing_option_groups`, `costing_options`, `costing_variant_option_groups`, `costing_variant_options`, `costing_option_effects` |
| Audit history | `costing_audit_events` |

There is no ledger table. Products and staff remain ordinary logical ID links.
No database-level relationship constraints or cascading actions are created.
Explicit indexes cover brand/location lists, relationship lookups, material kinds,
price/yield history, active recipe lists and audit history. Business-key unique
indexes and individual-row CHECK constraints remain; backend services must
validate all cross-record existence, ownership and scope relationships.

Material types remain distinct, and final drinks are separate recipe records.
Decimal fields use DECIMAL(20,8); tax basis and GST rate have no inferred default.
Preparation input units and measured output units are independent, so gram inputs
can yield millilitres without assuming mass and volume equivalence.

## Local execution after explicit approval only

1. Verify TCP 127.0.0.1:3306 is owned by the real local mysqld, not a tunnel.
   Validate the existing backend configuration's non-secret host/port/user/database
   fields before connecting. Use its password only in memory; never print or
   save it in another file. Do not start the existing app merely to execute SQL.
2. On that connection, check DATABASE() is membership_dev, @@port is 3306,
   @@datadir is /opt/homebrew/var/mysql/, and @@server_uuid is
   fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd. Stop on mismatch. Record the current
   existing-table definitions/counts without displaying row contents.
3. Inspect any existing costing objects. CREATE TABLE IF NOT EXISTS avoids
   recreating a matching table but does not verify its definition or upgrade it.
   Stop and review incompatible or partially created definitions; do not alter,
   drop or repair them automatically. Confirm existing reference codes agree
   before rerunning the essential seed.
4. Execute the approved schema.sql directly, then reference-data.sql on the same
   approved connection. Do not run membership_schema.sql or any legacy dump.
5. Verify 24 new table definitions, indexes, zero database relationship constraints
   and eight reference rows on a fresh setup. Confirm existing table definitions
   and records were not changed by setup. Record the outcome for the user.

CREATE TABLE statements implicitly commit in MySQL. If setup fails partway,
stop and report the partial state; do not automatically retry or delete anything.
The reference script inserts only missing keys and does not overwrite existing
rows. Its START TRANSACTION / COMMIT cover reference inserts only, not schema DDL.

No setup statement alters an existing membership table or writes to existing
products, staff, members, points, referrals or orders. Only new costing tables
and costing reference records are introduced.

## Production reuse and local development

Neither SQL file selects a database or embeds a host, user, password or local
server UUID. They can be separately reviewed and executed against an explicitly
approved production target later. Nothing connects or deploys to production now.
Do not push changes to GitHub without explicit user approval.

Local setup, Phase 1 protected Express APIs and the React staff management
interface are implemented and tested. The backend and staff portal are running
locally for user acceptance testing. Reuse products read-only and existing
staff authentication, keeping membership/referral/points/order logic unchanged.

Run current synthetic calculation and static schema tests with
`npm run test:costing` from membership-backend; these do not connect to MySQL.
