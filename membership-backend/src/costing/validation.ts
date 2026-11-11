import { Decimal } from "./decimal.js";
import type { Price, Unit } from "./calculator.js";
export class CostingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  status = 422,
): asserts condition {
  if (!condition) throw new CostingError(status, message);
}
export function id(value: unknown): string {
  const result = String(value ?? "");
  ensure(
    /^[1-9]\d{0,19}$/.test(result) && BigInt(result) <= 18446744073709551615n,
    "Invalid record ID.",
  );
  return result;
}
export function text(value: unknown, max = 150): string {
  ensure(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    `Enter text between 1 and ${max} characters.`,
  );
  return value.trim();
}
export function decimal(
  value: unknown,
  positive = false,
  signed = false,
): string {
  ensure(
    typeof value === "string" &&
      (signed ? /^-?\d{1,12}(\.\d{1,8})?$/ : /^\d{1,12}(\.\d{1,8})?$/).test(
        value,
      ),
    "Enter a decimal string with up to 12 integer and 8 decimal digits.",
  );
  if (positive)
    ensure(
      Decimal.of(value).compare(Decimal.of("0")) > 0,
      "Quantity must be greater than zero.",
    );
  return value;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  ensure(values.includes(value as T), `Choose one of: ${values.join(", ")}.`);
  return value as T;
}
export function unit(value: unknown): Unit {
  return choice(value, ["g", "kg", "ml", "l", "each", "dozen"] as const);
}
export function price(input: Record<string, unknown>): Price {
  const amount = decimal(input.amount);
  const gstRate = decimal(input.gstRate);
  ensure(
    Decimal.of(gstRate).compare(Decimal.of("1")) <= 0,
    "GST rate must be a fraction between 0 and 1.",
  );
  return {
    amount,
    gstRate,
    taxBasis: choice(input.taxBasis, ["EXCLUSIVE", "INCLUSIVE"] as const),
  };
}
export function integer(value: unknown, minimum = 0, maximum = 100): number {
  ensure(
    typeof value === "number" &&
      Number.isInteger(value) &&
      value >= minimum &&
      value <= maximum,
    `Enter a whole number from ${minimum} to ${maximum}.`,
  );
  return value;
}
export function version(value: unknown): number {
  return integer(value, 1, 4294967295);
}
