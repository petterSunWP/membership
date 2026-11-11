import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  measure,
  normalizeRow,
  stockInput,
  dateOnly,
  headers,
  parseWorkbook,
} from "../../src/inventory/parsing.js";
import { Decimal } from "../../src/costing/decimal.js";
import { bounded } from "../../src/inventory/parsing.js";
const row = (data = {}) =>
  normalizeRow({ code: "TEA_001", name: "茶叶", kind: "RAW", ...data });
test("normalizes mass, volume and whole counts without density assumptions", () => {
  assert.deepEqual(measure("1.25kg"), {
    quantity: "1250.00000000",
    unit: "g",
    source: "1.25kg",
  });
  assert.equal(measure("0.33L").quantity, "330.00000000");
  assert.equal(measure("500ML").unit, "ml");
  assert.equal(measure("25个").unit, "each");
  for (const v of ["0g", "-1kg", "12oz", "1kg/ml", "1.5个", "Infinityg"])
    assert.throws(() => measure(v));
  assert.equal(measure("0g", true).quantity, "0.00000000");
  assert.throws(() => bounded(Decimal.of("0.5"), "each"));
});
test("blank stock is unknown; zero is measured stock; price blank remains unknown", () => {
  const blank = stockInput(row());
  assert.equal(blank.stock, null);
  assert.equal(blank.spec, null);
  const zero = stockInput(
    row({ packText: "1kg", packages: "0", date: "2026-11-08", amount: "0" }),
  );
  assert.equal(zero.stock?.quantity, "0.00000000");
  const pack = stockInput(
    row({ packText: "0.1kg", packages: "3.5", date: "2026-11-08" }),
  );
  assert.equal(pack.stock?.quantity, "350.00000000");
  const total = stockInput(
    row({ kind: "PACKAGING", totalText: "298个", date: "2026-11-08" }),
  );
  assert.equal(total.spec, null);
  assert.equal(total.stock?.quantity, "298.00000000");
});
test("rejects ambiguous quantities, invalid dates, dimensions and prices", () => {
  for (const data of [
    { packText: "1g", packages: "2", totalText: "2g", date: "2026-11-08" },
    { packText: "1kg", totalText: "1ml", date: "2026-11-08" },
    { packages: "2", date: "2026-11-08" },
    { packText: "1kg", packages: "2" },
    { amount: "-1" },
    { amount: "NaN" },
  ])
    assert.throws(() => stockInput(row(data)));
  for (const date of ["2026-02-30", "2026-13-01", "08/11/2026"])
    assert.throws(() => dateOnly(date));
});
test("setup SQL only creates five indexed inventory tables and no foreign keys", () => {
  const sql = fs
    .readFileSync(
      new URL("../../sql/inventory/schema.sql", import.meta.url),
      "utf8",
    )
    .replace(/--[^\n]*/g, "");
  const statements = sql.split(";").filter((s) => s.trim());
  assert.equal(statements.length, 5);
  for (const s of statements) {
    assert.match(s, /^\s*CREATE TABLE IF NOT EXISTS inventory_/);
    assert.match(s, /PRIMARY KEY/);
    assert.match(s, /KEY \(/);
    assert.doesNotMatch(
      s,
      /\b(DROP|TRUNCATE|ALTER|DELETE|UPDATE|INSERT|REFERENCES|FOREIGN)\b/i,
    );
  }
  assert.equal(headers.length, 9);
});
test("rejects non-workbook uploads", async () => {
  await assert.rejects(() => parseWorkbook(Buffer.from("bad workbook")));
});
