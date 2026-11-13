// Presentation only. Never use these strings as calculation inputs.
export const money = (value: string | null | undefined, currency = "NZD") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value));

// Keep meaningful decimal digits, including tiny nonzero unit costs. Using decimal
// strings and BigInt avoids converting precise API values to binary floating point.
export function costMoney(
  value: string | null | undefined,
  currency = "NZD",
): string {
  if (value == null || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return "—";
  const source = value.trim(),
    negative = source.startsWith("-");
  const [whole, fraction = ""] = source.replace(/^[+-]/, "").split(".");
  const decimals = fraction.replace(/0+$/, "").padEnd(4, "0");
  const prefix = negative && /[1-9]/.test(source) ? "-" : "";
  return `${prefix}${new Intl.NumberFormat("en-NZ", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(BigInt(whole!))}.${decimals}`;
}
export function decimalDisplay(
  value: string | number | null | undefined,
  empty = "—",
): string {
  if (value == null || String(value).trim() === "") return empty;
  const source = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(source)) return source;
  const [whole, fraction = ""] = source.replace(/^[+-]/, "").split(".");
  const integer = whole!.replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  return `${source.startsWith("-") && /[1-9]/.test(source) ? "-" : ""}${integer}${decimals ? `.${decimals}` : ""}`;
}
export const percentDisplay = (value: string | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-NZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(Number(value));
