# Recipe Costing + Inventory v1: manual server release

The chosen workflow is: commit/push application code, pull on the existing server,
back up its database, create additive tables/reference data, configure the new module,
build and restart using the existing deployment procedure. Production source inventory
will be uploaded again from the user's real Excel workbook. No local database data is copied.
No production operations or GitHub push have been performed by this preparation.

## 1. Submit the code

Use the existing feature/recipe-costing branch. Include the costing/inventory source,
reviewed SQL, tests, package/lockfile changes and staff navigation changes. Exclude all
.env files other than the placeholder .env.example, .local-backups, outputs, node_modules,
dist and local workbooks. The ignore file protects generated artifacts and backups.
Do not force push or switch the server to a different branch without checking the current
release workflow. This repository contains uncommitted Phase 1 work; the user will submit
it using their existing Git identity and workflow.

## 2. Before changing the server

Record the current deployed commit and previous staff assets for application rollback.
Verify the server working tree is clean; stop and preserve any server-only modifications.
Then pull the intended release branch/commit using the normal deployment workflow.
Do not replace the server's .env with local development configuration.

Use Node 22.12+ for the frontend build (the installed Vite requires ^20.19.0 or >=22.12.0;
use the existing supported server runtime if already suitable). Database setup targets
MySQL 8.0.16+ (CHECK constraints) / compatible MySQL 8 and requires server_uuid support.
Stop if the server is MariaDB or otherwise incompatible; do not assume its identity/features.

Connect using existing server credentials without placing passwords in command arguments.
With MySQL selected on the existing application database, inspect:

```sql
SELECT DATABASE() AS database_name, @@hostname AS server_name,
       @@port AS mysql_port, @@server_uuid AS server_uuid, VERSION() AS version;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE()
  AND (LEFT(TABLE_NAME,8)='costing_' OR LEFT(TABLE_NAME,10)='inventory_');
```

Confirm this is the intended existing production database. If any module tables already
exist, compare SHOW CREATE TABLE to the reviewed definitions and stop on conflicts.
CREATE TABLE IF NOT EXISTS does not validate existing definitions.
Back up the selected database using your existing production backup process; verify it
completed successfully before SQL. Retain the backup privately outside Git/web-accessible files.
Do not copy .local-backups or the development database to the server.

## 3. Create only new module tables

Run exactly these files in order on the same verified application database:

```text
membership-backend/sql/costing/schema.sql         (24 new costing_ tables)
membership-backend/sql/inventory/schema.sql       (5 new inventory_ tables)
membership-backend/sql/costing/reference-data.sql (TEA TALK, Westgate, six units)
```

For example, from an interactive mysql client connected to that database, SOURCE the
files using their actual server paths. There is no migration runner, ledger, foreign key
or automatic startup SQL. Do not run membership_schema.sql, old dump setup scripts or
any DROP/TRUNCATE/ALTER/DELETE statements. Existing membership/product/order/points
records are not part of this setup.

Afterward verify 24 costing_ and 5 inventory_ tables, no new foreign keys, and the essential
TEA_TALK/WESTGATE/unit references. Review original table definitions and use production-safe
backup/audit checks to verify preservation; normal live membership writes may continue.

## 4. Add explicit production target configuration

Keep all existing DB_* credentials and the existing database. Add to the server's backend
environment (see membership-backend/.env.example for placeholders):

```dotenv
COSTING_DB_MODE=production
COSTING_DB_EXPECTED_NAME=<exact existing DB_NAME>
COSTING_DB_EXPECTED_SERVER_UUID=<actual production UUID from step 2>
```

Replace placeholders; do not include angle brackets. DB_PORT must match the actual selected
MySQL server port. The connection uses the existing DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.
Service-manager environment variables take precedence over .env: reconcile any stale overrides
using the existing service-manager procedure. Work from membership-backend for npm/build/start.

Local default mode remains locked to the verified local database, UUID and datadir.
Production explicitly checks expected database/port/UUID and refuses the known development
server UUID. It does not require renaming the existing production database. New environment
settings are mandatory before restarting production; missing or mismatched configuration
will block costing/inventory or application startup rather than select another database.
Do not modify membership connection logic or grant new MySQL privileges automatically.

## 5. Bootstrap intended production staff access

Do not copy local staff ID 1 or product IDs. Identify the intended existing active ADMIN
account on production:

```sql
SELECT id, first_name, last_name, role, status
FROM staff_users WHERE role='ADMIN' AND status='ACTIVE';
```

Once you have selected your verified production staff ID, run this with that actual ID
(the placeholder must be replaced; this is a manual permission assignment):

```sql
SET @costing_admin_staff_id = <verified production staff ID>;
INSERT INTO costing_staff_access (brand_id,location_id,staff_user_id,permission)
SELECT b.id,l.id,s.id,'ADMIN'
FROM costing_brands b
JOIN costing_locations l ON l.brand_id=b.id AND l.code='WESTGATE'
JOIN staff_users s ON s.id=@costing_admin_staff_id AND s.status='ACTIVE' AND s.role='ADMIN'
WHERE b.code='TEA_TALK'
  AND NOT EXISTS (
    SELECT 1 FROM costing_staff_access a
    WHERE a.brand_id=b.id AND a.location_id=l.id AND a.staff_user_id=s.id
  );
```

Verify exactly the intended access row. Existing grants are never overwritten. This adds
module access only, without changing staff records, membership permissions or MySQL grants.
The configured module admin can subsequently grant scoped staff access through Recipe Costing.

## 6. Install, build, restart

Use the project's normal server directories and service names; no unknown paths/service
names are assumed here. Install locked dependencies and build before replacing the running
release. Include dev dependencies during the build even when NODE_ENV is production;
TypeScript and Vite are build-time dependencies. Examples from the actual repository root:

```bash
npm ci --include=dev --prefix membership-backend
npm run build --prefix membership-backend
npm ci --include=dev --prefix membership-store
```

Build membership-store using the existing production VITE_API_BASE_URL:

```bash
# Use the actual existing production API origin, not this placeholder.
VITE_API_BASE_URL=https://YOUR_EXISTING_API_HOST npm run build --prefix membership-store
```

If the frontend already has a verified production .env/configuration, retain it and use the
existing build command. The default fallback is localhost and must not be shipped to production.
Keep existing backend CORS origins (STORE_WEB_URL etc.), reverse proxy, TLS, customer frontend
and staff SPA routing. Serve the new staff dist using the existing deployment process;
restart only the relevant backend with its existing service manager and correct environment.
Do not run development integration tests against production; they intentionally target local MySQL.

## 7. Acceptance and initial real Excel upload

- Verify normal staff sign-in, customer lookup, orders and points pages still function.
  Do not create fake live customer orders or points for testing.
- Open Recipe Costing and Inventory as the intended production admin; verify TEA TALK Westgate.
- Download a template, check it loads and confirm no localhost API calls appear in the browser.
- Upload the real reviewed inventory Excel, choose **Stocktake** for initial actual stock,
  **GST exclusive** for the user's confirmed source prices, and review GST rate (0 allowed).
- Review codes, units, actual balances, packaging pack contents and prices before confirmation.
  Rows with both quantity and price blank make no changes. Blank prices are not zero.
- An enabled price without compatible pack contents blocks the row. Correct it or explicitly
  turn off price sync / skip the row and refresh; no silently partial invalid batch is posted.
- Confirm the intended initial Stocktake once; check stock, ledger operator/date/import ID and
  price history. Preserve source count dates; do not use Receipt for initial counted stock.
- For future incoming deliveries choose **Stock Receipt**, use a unique real delivery reference
  and its actual date. Reuse the same reference for retries to prevent duplicate posting.

## Rollback

If application checks fail, restore the prior backend release/config and prior staff assets
using the existing deployment procedure. Retain the additive module tables/history and backups.
Do not drop tables, erase movements or restore a dump over a live database as an app rollback.
If new inventory has already been posted, preserve it and investigate before any corrective action.

## Release validation

Local unit, HTTP/SQL and frontend tests must pass after production-policy changes. SQL fixtures
remain local and rolled back. Builds done without production frontend configuration are local
verification artifacts, not production assets. The operator still needs to perform the server
steps above; this document does not claim a completed deployment.

Validation after production-policy adaptation: 35 backend unit/schema/workbook tests passed;
13 costing and 19 inventory integration scenarios passed with rollback-only local fixtures.
Two optional old-workbook checks were skipped because the private file is unavailable.
The compiled backend costing module successfully loads the existing local configuration from
the backend working directory. Production policy was tested only with synthetic configuration;
no production server/database was contacted. The existing frontend build and 12 frontend tests pass.
