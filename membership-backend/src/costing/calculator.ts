import { Decimal } from "./decimal.js";

export type Unit = "g" | "kg" | "ml" | "l" | "each" | "dozen";
export type TaxBasis = "EXCLUSIVE" | "INCLUSIVE";
export interface Price {
  amount: string;
  taxBasis: TaxBasis;
  gstRate: string;
}
export interface Quantity {
  quantity: string;
  unit: Unit;
}
export interface Line extends Quantity {
  materialId: string;
}
export type Material =
  | {
      id: string;
      kind: "RAW" | "PACKAGING";
      unit: Unit;
      price: Price;
      usable: Quantity;
    }
  | {
      id: string;
      kind: "PREPARED";
      unit: Unit;
      yield: Quantity;
      inputs: Line[];
    };
export type Effect =
  | { operation: "ADD"; line: Line }
  | { operation: "REMOVE"; target: number }
  | { operation: "REPLACE"; target: number; line: Line }
  | { operation: "SET_QUANTITY"; target: number; quantity: string; unit: Unit };

const zero = Decimal.of("0");
const units: Record<Unit, { dimension: string; factor: string }> = {
  g: { dimension: "MASS", factor: "1" },
  kg: { dimension: "MASS", factor: "1000" },
  ml: { dimension: "VOLUME", factor: "1" },
  l: { dimension: "VOLUME", factor: "1000" },
  each: { dimension: "COUNT", factor: "1" },
  dozen: { dimension: "COUNT", factor: "12" },
};

function nonNegative(value: string): Decimal {
  const result = Decimal.of(value);
  if (result.compare(zero) < 0) throw new Error("NEGATIVE_VALUE");
  return result;
}
function positive(value: string): Decimal {
  const result = nonNegative(value);
  if (result.compare(zero) === 0) throw new Error("QUANTITY_MUST_BE_POSITIVE");
  return result;
}
export function convert(quantity: string, from: Unit, to: Unit): Decimal {
  if (!Object.hasOwn(units, from) || !Object.hasOwn(units, to))
    throw new Error("UNKNOWN_UNIT");
  if (units[from].dimension !== units[to].dimension)
    throw new Error("INCOMPATIBLE_UNITS");
  return nonNegative(quantity)
    .mul(Decimal.of(units[from].factor))
    .div(Decimal.of(units[to].factor));
}
export function exclusive(price: Price): Decimal {
  if (price.taxBasis !== "EXCLUSIVE" && price.taxBasis !== "INCLUSIVE")
    throw new Error("EXPLICIT_TAX_BASIS_REQUIRED");
  const amount = nonNegative(price.amount);
  const rate = nonNegative(price.gstRate);
  if (rate.compare(Decimal.of("1")) > 0) throw new Error("INVALID_GST_RATE");
  return price.taxBasis === "INCLUSIVE"
    ? amount.div(Decimal.of("1").add(rate))
    : amount;
}

/** One immutable, same-currency/location input snapshot per calculation. No DB or env imports. */
export function createCalculator(materials: readonly Material[]) {
  const byId = new Map(
    structuredClone(materials).map((material) => [material.id, material]),
  );
  if (byId.size !== materials.length) throw new Error("DUPLICATE_MATERIAL");
  const memo = new Map<string, Decimal>();
  const visiting = new Set<string>();

  function lineCost(line: Line): Decimal {
    const material = byId.get(line.materialId);
    if (!material) throw new Error(`MATERIAL_NOT_FOUND:${line.materialId}`);
    return convert(line.quantity, line.unit, material.unit).mul(
      unitCost(material.id),
    );
  }
  function unitCost(id: string): Decimal {
    const cached = memo.get(id);
    if (cached) return cached;
    const material = byId.get(id);
    if (!material) throw new Error(`MATERIAL_NOT_FOUND:${id}`);
    if (visiting.has(id)) throw new Error("PREPARATION_CYCLE");
    if (visiting.size >= 64) throw new Error("PREPARATION_DEPTH_LIMIT");
    visiting.add(id);
    try {
      let cost: Decimal;
      if (material.kind === "PREPARED") {
        if (material.inputs.length === 0) throw new Error("EMPTY_PREPARATION");
        positive(material.yield.quantity);
        const output = convert(
          material.yield.quantity,
          material.yield.unit,
          material.unit,
        );
        cost = material.inputs
          .reduce((sum, line) => sum.add(lineCost(line)), zero)
          .div(output);
      } else {
        positive(material.usable.quantity);
        cost = exclusive(material.price).div(
          convert(
            material.usable.quantity,
            material.usable.unit,
            material.unit,
          ),
        );
      }
      memo.set(id, cost);
      return cost;
    } finally {
      visiting.delete(id);
    }
  }
  function recipe(lines: readonly Line[], sellingPrice: Price) {
    if (lines.length === 0) throw new Error("EMPTY_RECIPE");
    const breakdown = lines.map((line) => ({ ...line, cost: lineCost(line) }));
    const cost = breakdown.reduce((sum, line) => sum.add(line.cost), zero);
    const revenue = exclusive(sellingPrice);
    const profit = revenue.sub(cost);
    return {
      cost: cost.toCostString(),
      revenue: revenue.toFixed(),
      grossProfit: profit.toFixed(),
      marginPercent:
        revenue.compare(zero) === 0
          ? null
          : profit.div(revenue).mul(Decimal.of("100")).toFixed(4),
      breakdown: breakdown.map((line) => ({
        ...line,
        cost: line.cost.toCostString(),
      })),
    };
  }
  return { unitCost, recipe };
}

/** Targets refer to original recipe-line positions, independent of effect order. */
export function customise(
  lines: readonly Line[],
  effects: readonly Effect[],
): Line[] {
  const result: (Line | null)[] = lines.map((line) => ({ ...line }));
  const touched = new Set<number>();
  for (const effect of effects) {
    if (effect.operation === "ADD") {
      positive(effect.line.quantity);
      result.push({ ...effect.line });
      continue;
    }
    if (
      !Number.isInteger(effect.target) ||
      effect.target < 0 ||
      effect.target >= lines.length
    )
      throw new Error("INVALID_EFFECT_TARGET");
    if (touched.has(effect.target)) throw new Error("CONFLICTING_EFFECTS");
    touched.add(effect.target);
    if (effect.operation === "REMOVE") result[effect.target] = null;
    else if (effect.operation === "REPLACE") {
      positive(effect.line.quantity);
      result[effect.target] = { ...effect.line };
    } else {
      nonNegative(effect.quantity);
      // A SET changes quantity, not the measurement dimension of the line.
      convert(effect.quantity, effect.unit, lines[effect.target]!.unit);
      result[effect.target] = {
        ...lines[effect.target]!,
        quantity: effect.quantity,
        unit: effect.unit,
      };
    }
  }
  return result.filter((line): line is Line => line !== null);
}
