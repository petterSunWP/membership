/** Exact rational arithmetic. Decimal strings are never converted to JS numbers. */
export class Decimal {
  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {}

  static of(value: string): Decimal {
    if (!/^-?\d{1,20}(\.\d{1,12})?$/.test(value))
      throw new Error("INVALID_DECIMAL");
    const [whole, fraction = ""] = value.split(".");
    const sign = value.startsWith("-") ? -1n : 1n;
    return Decimal.rational(
      BigInt(whole.replace("-", "") + fraction) * sign,
      10n ** BigInt(fraction.length),
    );
  }

  private static rational(n: bigint, d: bigint): Decimal {
    if (d === 0n) throw new Error("DIVISION_BY_ZERO");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    let a = n < 0n ? -n : n;
    let b = d;
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return new Decimal(n / a, d / a);
  }

  add(other: Decimal): Decimal {
    return Decimal.rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }
  sub(other: Decimal): Decimal {
    return Decimal.rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }
  mul(other: Decimal): Decimal {
    return Decimal.rational(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }
  div(other: Decimal): Decimal {
    return Decimal.rational(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }
  compare(other: Decimal): number {
    const delta =
      this.numerator * other.denominator - other.numerator * this.denominator;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  }

  /** Cost API output only: retain >=8 places, extending tiny nonzero values.
   * Internal rational arithmetic and stored historical DECIMAL values are unchanged.
   */
  toCostString(): string {
    const normal = this.toFixed(8);
    if (this.numerator === 0n || /[1-9]/.test(normal)) return normal;
    const absolute = this.numerator < 0n ? -this.numerator : this.numerator;
    const places = Math.max(
      8,
      this.denominator.toString().length - absolute.toString().length + 3,
    );
    return this.formatFixed(places);
  }

  /** Round half away from zero, only at an output boundary. */
  toFixed(places = 8): string {
    if (!Number.isInteger(places) || places < 0 || places > 12)
      throw new Error("INVALID_PRECISION");
    return this.formatFixed(places);
  }
  private formatFixed(places: number): string {
    const scale = 10n ** BigInt(places);
    const negative = this.numerator < 0n;
    const scaled = (negative ? -this.numerator : this.numerator) * scale;
    let rounded = scaled / this.denominator;
    if ((scaled % this.denominator) * 2n >= this.denominator) rounded += 1n;
    const digits = rounded.toString().padStart(places + 1, "0");
    const result =
      places === 0
        ? digits
        : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
    return negative && rounded !== 0n ? `-${result}` : result;
  }
}
