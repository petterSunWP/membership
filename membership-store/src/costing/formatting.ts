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

// Round costs to four places, extending only when a nonzero value would become zero.
// Decimal strings and BigInt keep this display-only rounding free of binary float errors.
export function costMoney(
  value: string | null | undefined,
  currency = "NZD",
): string {
  if (value == null || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return "—";
  const source = value.trim(),
    negative = source.startsWith("-");
  const [whole, fraction = ""] = source.replace(/^[+-]/, "").split(".");
  const roundedAt = (places: number) => {
    const kept = fraction.padEnd(places, "0").slice(0, places);
    return (
      BigInt(`${whole}${kept}`) + ((fraction[places] ?? "0") >= "5" ? 1n : 0n)
    );
  };
  let places = 4;
  let rounded = roundedAt(places);
  while (rounded === 0n && /[1-9]/.test(source)) rounded = roundedAt(++places);
  const digits = rounded.toString().padStart(places + 1, "0");
  const integer = digits.slice(0, -places);
  const decimals = digits.slice(-places);
  const prefix = negative && rounded !== 0n ? "-" : "";
  return `${prefix}${new Intl.NumberFormat("en-NZ", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(BigInt(integer))}.${decimals}`;
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
