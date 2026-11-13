import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../../src/costing/decimal.js";
import {
  convert,
  exclusive,
  createCalculator,
  customise,
  type Material,
  type Price,
} from "../../src/costing/calculator.js";

const price = (amount: string): Price => ({
  amount,
  taxBasis: "EXCLUSIVE",
  gstRate: "0.15",
});
function fixture(): Material[] {
  return [
    {
      id: "leaves",
      kind: "RAW",
      unit: "g",
      price: price("12"),
      usable: { quantity: "100", unit: "g" },
    },
    {
      id: "tea",
      kind: "PREPARED",
      unit: "ml",
      yield: { quantity: "2400", unit: "ml" },
      inputs: [{ materialId: "leaves", quantity: "100", unit: "g" }],
    },
    {
      id: "cup",
      kind: "PACKAGING",
      unit: "each",
      price: price("10"),
      usable: { quantity: "100", unit: "each" },
    },
    {
      id: "mix",
      kind: "PREPARED",
      unit: "ml",
      yield: { quantity: "1000", unit: "ml" },
      inputs: [{ materialId: "tea", quantity: "500", unit: "ml" }],
    },
  ];
}
const lines = [
  { materialId: "tea", quantity: "400", unit: "ml" as const },
  { materialId: "cup", quantity: "1", unit: "each" as const },
];

test("exact decimal arithmetic retains repeating fractions until output", () => {
  assert.equal(Decimal.of("0.1").add(Decimal.of("0.2")).toFixed(2), "0.30");
  assert.equal(
    Decimal.of("1").div(Decimal.of("3")).mul(Decimal.of("3")).toFixed(8),
    "1.00000000",
  );
  assert.equal(Decimal.of("-1.005").toFixed(2), "-1.01");
  assert.equal(
    Decimal.of("99999999999999999999").add(Decimal.of("1")).toFixed(0),
    "100000000000000000000",
  );
  assert.throws(() => Decimal.of("1e3"), /INVALID_DECIMAL/);
  assert.throws(() => Decimal.of("1").div(Decimal.of("0")), /DIVISION_BY_ZERO/);
});
test("dimension conversions reject grams to ml and support count units", () => {
  assert.equal(convert("1.25", "kg", "g").toFixed(0), "1250");
  assert.equal(convert("2", "dozen", "each").toFixed(0), "24");
  assert.throws(() => convert("1", "g", "ml"), /INCOMPATIBLE_UNITS/);
  assert.throws(() => convert("-1", "g", "g"), /NEGATIVE_VALUE/);
});
test("explicit GST-inclusive retail revenue is compared with exclusive costs", () => {
  const result = createCalculator(fixture()).recipe(lines, {
    amount: "11.50",
    taxBasis: "INCLUSIVE",
    gstRate: "0.15",
  });
  assert.equal(result.cost, "2.10000000");
  assert.equal(result.revenue, "10.00000000");
  assert.equal(result.grossProfit, "7.90000000");
  assert.equal(result.marginPercent, "79.0000");
  assert.equal(
    exclusive({
      amount: "11.50",
      taxBasis: "INCLUSIVE",
      gstRate: "0.15",
    }).toFixed(2),
    "10.00",
  );
  assert.throws(
    () => exclusive({ amount: "1", gstRate: "0.15" } as Price),
    /EXPLICIT_TAX_BASIS_REQUIRED/,
  );
  assert.throws(
    () => exclusive({ ...price("1"), gstRate: "-0.15" }),
    /NEGATIVE_VALUE/,
  );
});
test("gram inputs yield measured ml; nested preparations and changed prices recalculate", () => {
  const materials = fixture();
  const first = createCalculator(materials);
  assert.equal(first.unitCost("tea").toFixed(), "0.00500000");
  assert.equal(first.unitCost("mix").toFixed(), "0.00250000");
  const raw = materials[0]!;
  if (raw.kind !== "PREPARED") raw.price = price("24");
  assert.equal(
    createCalculator(materials).unitCost("mix").toFixed(),
    "0.00500000",
  );
  assert.equal(first.unitCost("tea").toFixed(), "0.00500000");
});
test("missing materials, zero yield and cycles fail instead of becoming free ingredients", () => {
  assert.throws(
    () => createCalculator(fixture()).unitCost("missing"),
    /MATERIAL_NOT_FOUND/,
  );
  const materials = fixture();
  const tea = materials[1]!;
  if (tea.kind === "PREPARED") tea.yield.quantity = "0";
  assert.throws(
    () => createCalculator(materials).unitCost("tea"),
    /QUANTITY_MUST_BE_POSITIVE/,
  );
  if (tea.kind === "PREPARED") {
    tea.yield.quantity = "100";
    tea.inputs = [{ materialId: "mix", quantity: "1", unit: "ml" }];
  }
  assert.throws(
    () => createCalculator(materials).unitCost("tea"),
    /PREPARATION_CYCLE/,
  );
});
test("sizes have independent quantities, packaging and profitability", () => {
  const calc = createCalculator(fixture());
  const large = [{ ...lines[0]!, quantity: "600" }, lines[1]!];
  assert.equal(calc.recipe(lines, price("10")).cost, "2.10000000");
  assert.equal(calc.recipe(large, price("12")).cost, "3.10000000");
  assert.equal(calc.recipe(lines, price("0")).marginPercent, null);
  assert.equal(calc.recipe(lines, price("1")).grossProfit, "-1.10000000");
});
test("customisations support additions, removal, replacement and explicit quantity changes", () => {
  const modified = customise(lines, [
    { operation: "SET_QUANTITY", target: 0, quantity: "200", unit: "ml" },
    {
      operation: "ADD",
      line: { materialId: "mix", quantity: "100", unit: "ml" },
    },
  ]);
  assert.equal(
    createCalculator(fixture()).recipe(modified, price("10")).cost,
    "1.35000000",
  );
  assert.equal(
    customise(lines, [{ operation: "REMOVE", target: 0 }]).length,
    1,
  );
  assert.equal(
    customise(lines, [
      {
        operation: "REPLACE",
        target: 0,
        line: { materialId: "mix", quantity: "100", unit: "ml" },
      },
    ])[0]!.materialId,
    "mix",
  );
  assert.throws(
    () =>
      customise(lines, [
        { operation: "REMOVE", target: 0 },
        { operation: "REMOVE", target: 0 },
      ]),
    /CONFLICTING_EFFECTS/,
  );
  assert.throws(
    () => customise(lines, [{ operation: "REMOVE", target: 99 }]),
    /INVALID_EFFECT_TARGET/,
  );
  assert.throws(
    () =>
      customise(lines, [
        { operation: "SET_QUANTITY", target: 0, quantity: "1", unit: "g" },
      ]),
    /INCOMPATIBLE_UNITS/,
  );
  assert.equal(lines[0]!.quantity, "400");
});

test("60g tea leaves at $26/500g yields exact low-cost tea and drink costs", () => {
  const materials: Material[] = [
    {
      id: "red",
      kind: "RAW",
      unit: "g",
      price: price("26"),
      usable: { quantity: "500", unit: "g" },
    },
    {
      id: "tea",
      kind: "PREPARED",
      unit: "ml",
      yield: { quantity: "3000", unit: "ml" },
      inputs: [{ materialId: "red", quantity: "60", unit: "g" }],
    },
  ];
  const calc = createCalculator(materials);
  assert.equal(calc.unitCost("red").toCostString(), "0.05200000");
  assert.equal(calc.unitCost("tea").toCostString(), "0.00104000");
  const result = calc.recipe(
    [{ materialId: "tea", quantity: "450", unit: "ml" }],
    { amount: "5.75", taxBasis: "INCLUSIVE", gstRate: "0.15" },
  );
  assert.equal(result.cost, "0.46800000");
  assert.equal(result.breakdown[0]!.cost, "0.46800000");
  assert.equal(result.revenue, "5.00000000");
  assert.equal(result.grossProfit, "4.53200000");
  assert.equal(result.marginPercent, "90.6400");
});
test("tiny prepared unit costs stay nonzero in API output and propagate without intermediate rounding", () => {
  const calc = createCalculator([
    {
      id: "raw",
      kind: "RAW",
      unit: "g",
      price: price("1"),
      usable: { quantity: "1", unit: "g" },
    },
    {
      id: "tiny",
      kind: "PREPARED",
      unit: "ml",
      yield: { quantity: "3000000000", unit: "ml" },
      inputs: [{ materialId: "raw", quantity: "1", unit: "g" }],
    },
  ]);
  const unit = calc.unitCost("tiny");
  assert.equal(unit.toFixed(), "0.00000000");
  assert.ok(Decimal.of(unit.toCostString()).compare(Decimal.of("0")) > 0);
  const result = calc.recipe(
    [{ materialId: "tiny", quantity: "3000000000", unit: "ml" }],
    price("5"),
  );
  assert.equal(result.cost, "1.00000000");
  const small = calc.recipe(
    [{ materialId: "tiny", quantity: "1", unit: "ml" }],
    price("5"),
  );
  assert.ok(Decimal.of(small.cost).compare(Decimal.of("0")) > 0);
  assert.equal(small.breakdown[0]!.cost, small.cost);
  assert.equal(Decimal.of("0").toCostString(), "0.00000000");
  assert.equal(
    Decimal.of("-0.000000000001").toCostString(),
    "-0.000000000001000",
  );
});
