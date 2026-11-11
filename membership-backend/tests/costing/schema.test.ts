import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) =>
  readFileSync(new URL(`../../sql/costing/${file}`, import.meta.url), "utf8");
const schema = read("schema.sql");
const seed = read("reference-data.sql");

test("setup statements only create costing tables and insert costing reference data", () => {
  for (const file of ["schema.sql", "reference-data.sql"]) {
    const sql = read(file).replace(/--[^\n]*/g, "");
    assert.doesNotMatch(
      sql.replace(/'[^']*'/g, "''"),
      /\b(DROP|ALTER|TRUNCATE|DELETE|UPDATE|REPLACE)\b/i,
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      assert.match(
        statement,
        /^(CREATE TABLE IF NOT EXISTS costing_|INSERT INTO costing_|START TRANSACTION$|COMMIT$)/,
      );
    }
  }
});
test("schema defines explicit tax fields with no GST default and scopes all domain entities", () => {
  assert.match(schema, /tax_basis VARCHAR\(10\) NOT NULL CHECK/);
  assert.doesNotMatch(schema, /gst_rate[^\n]*DEFAULT/);
  const tables = [
    ...schema.matchAll(
      /CREATE TABLE IF NOT EXISTS costing_(\w+) \(([\s\S]*?)\n\) ENGINE/g,
    ),
  ];
  assert.equal(tables.length, 24);
  for (const [, name, body] of tables) {
    if (["brands", "locations", "units"].includes(name!)) continue;
    assert.match(body!, /brand_id BIGINT UNSIGNED NOT NULL/);
    assert.match(body!, /location_id BIGINT UNSIGNED NOT NULL/);
  }
});

test("all new tables have their own primary key and no database relationship constraints", () => {
  const sql = schema + "\n" + seed;
  assert.doesNotMatch(
    sql,
    /\bFOREIGN\s+KEY\b|\bREFERENCES\b|\bON\s+(DELETE|UPDATE)\b/i,
  );
  const tables = [
    ...sql.matchAll(
      /CREATE TABLE IF NOT EXISTS (costing_\w+) \(([\s\S]*?)\n\) ENGINE/g,
    ),
  ];
  assert.equal(tables.length, 24);
  for (const [, name, body] of tables) {
    assert.equal(
      [...body!.matchAll(/\bPRIMARY KEY\b/g)].length,
      1,
      `${name} must own one primary key`,
    );
  }
});

test("logical relationship and scope fields retain usable lookup index prefixes", () => {
  const tables = [
    ...schema.matchAll(
      /CREATE TABLE IF NOT EXISTS (costing_\w+) \(([\s\S]*?)\n\) ENGINE/g,
    ),
  ];
  for (const [, name, body] of tables) {
    const columns = [
      ...body!.matchAll(
        /^  (\w+) (?:BIGINT|VARCHAR|CHAR|INT|DECIMAL|DATETIME|TEXT|JSON|BOOLEAN)/gm,
      ),
    ].map((m) => m[1]!);
    const keys = [...body!.matchAll(/(?:UNIQUE )?KEY \(([^)]+)\)/g)].map((m) =>
      m[1]!.split(",").map((c) => c.trim()),
    );
    const scoped =
      columns.includes("brand_id") && columns.includes("location_id");
    const hasPrefix = (prefix: string[]) =>
      keys.some((key) => prefix.every((col, i) => key[i] === col));
    if (scoped)
      assert.ok(
        hasPrefix(["brand_id", "location_id"]),
        `${name}: scope lookup`,
      );
    for (const column of columns.filter(
      (c) => c.endsWith("_id") || ["created_by", "unit_code"].includes(c),
    )) {
      if (scoped && ["brand_id", "location_id"].includes(column)) continue;
      assert.ok(
        hasPrefix([column]) ||
          (scoped && hasPrefix(["brand_id", "location_id", column])),
        `${name}: ${column} lookup`,
      );
    }
  }
});

test("logical ownership IDs remain available for backend validation", () => {
  const tables = new Map(
    [
      ...schema.matchAll(
        /CREATE TABLE IF NOT EXISTS (costing_\w+) \(([\s\S]*?)\n\) ENGINE/g,
      ),
    ].map((m) => [m[1]!, m[2]!]),
  );
  const required: Record<string, string[]> = {
    locations: ["brand_id"],
    staff_access: ["staff_user_id"],
    product_links: ["product_id"],
    material_prices: ["material_id", "created_by"],
    material_price_heads: ["material_id", "price_id"],
    preparation_revisions: ["material_id", "created_by"],
    preparation_lines: ["preparation_revision_id", "input_material_id"],
    yield_measurements: ["preparation_revision_id", "created_by"],
    preparation_heads: [
      "material_id",
      "preparation_revision_id",
      "yield_measurement_id",
    ],
    recipe_variants: ["drink_recipe_id", "size_id", "product_link_id"],
    recipe_revisions: ["variant_id", "created_by"],
    recipe_lines: ["recipe_revision_id", "material_id"],
    recipe_heads: ["variant_id", "recipe_revision_id"],
    options: ["option_group_id"],
    variant_option_groups: ["variant_id", "option_group_id"],
    variant_options: ["variant_id", "option_group_id", "option_id"],
    option_effects: [
      "variant_option_id",
      "variant_id",
      "recipe_revision_id",
      "target_line_id",
      "material_id",
    ],
    audit_events: ["entity_id", "created_by"],
  };
  for (const [name, columns] of Object.entries(required)) {
    for (const column of columns)
      assert.match(
        tables.get(`costing_${name}`)!,
        new RegExp(`\\b${column} BIGINT UNSIGNED\\b`),
      );
  }
});
test("seed omits product mappings, tax treatment, sizes, prices and permissions", () => {
  const targets = [...seed.matchAll(/INSERT INTO (\w+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(targets, [
    "costing_brands",
    "costing_locations",
    "costing_units",
  ]);
  assert.match(seed, /'WESTGATE'/);
  assert.match(seed, /'TEA_TALK'/);
});

test("reruns guard table creation and insert only missing reference keys", () => {
  for (const file of ["schema.sql"]) {
    const sql = read(file).replace(/--[^\n]*/g, "");
    assert.doesNotMatch(sql, /CREATE TABLE (?!IF NOT EXISTS)/);
  }
  assert.equal(
    [...seed.matchAll(/WHERE NOT EXISTS|AND NOT EXISTS/g)].length,
    3,
  );
  assert.doesNotMatch(seed, /INSERT IGNORE|ON DUPLICATE KEY/i);
});

test("setup is portable and has no ledger, connection selection or automatic executor", () => {
  for (const sql of [schema, seed]) {
    assert.doesNotMatch(
      sql.replace(/--[^\n]*/g, ""),
      /costing_schema_migrations|\bUSE\s+|CREATE DATABASE|127\.0\.0\.1|membership_dev/i,
    );
  }
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    Object.keys(pkg.scripts).every(
      (key) => !/migrat|setup.*costing|costing.*setup/i.test(key),
    ),
  );
});

test("essential reference inserts execute within one transaction", () => {
  const sql = seed.replace(/--[^\n]*/g, "").trim();
  assert.ok(sql.startsWith("START TRANSACTION;"));
  assert.ok(sql.endsWith("COMMIT;"));
  assert.equal([...sql.matchAll(/START TRANSACTION/g)].length, 1);
  assert.equal([...sql.matchAll(/COMMIT/g)].length, 1);
});
