import test from "node:test";
import assert from "node:assert/strict";
import {
  id,
  decimal,
  price,
  integer,
  CostingError,
} from "../../src/costing/validation.js";
test("API validation preserves IDs outside JS safe-integer range", () => {
  assert.equal(id("18446744073709551615"), "18446744073709551615");
  assert.throws(() => id("18446744073709551616"), CostingError);
  assert.throws(() => id("1 OR 1=1"), CostingError);
});
test("database-bound decimal validation rejects numbers, overflow and excessive precision", () => {
  assert.equal(decimal("0.10000000"), "0.10000000");
  for (const value of [0.1, "1e3", "-1", "1000000000000", "0.000000001"])
    assert.throws(() => decimal(value), CostingError);
  assert.throws(() => decimal("0", true), CostingError);
});
test("GST treatment is explicit and zero GST is a valid configured choice", () => {
  assert.deepEqual(
    price({ amount: "1", taxBasis: "INCLUSIVE", gstRate: "0" }),
    { amount: "1", taxBasis: "INCLUSIVE", gstRate: "0" },
  );
  assert.throws(() => price({ amount: "1", gstRate: "0.15" }), CostingError);
  assert.throws(
    () => price({ amount: "1", taxBasis: "INCLUSIVE", gstRate: "15" }),
    CostingError,
  );
  assert.throws(() => integer(1.5), CostingError);
});
