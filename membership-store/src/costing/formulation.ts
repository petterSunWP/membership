import type { Line, Material, Unit } from "./api";
const factors: Record<Unit, { dimension: string; factor: bigint }> = {
  g: { dimension: "mass", factor: 1n },
  kg: { dimension: "mass", factor: 1000n },
  ml: { dimension: "volume", factor: 1n },
  l: { dimension: "volume", factor: 1000n },
  each: { dimension: "count", factor: 1n },
  dozen: { dimension: "count", factor: 12n },
};
export function searchMaterials(
  materials: Material[],
  query: string,
): Material[] {
  const tokens = query
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return materials.filter(
    (m) =>
      m.status === "ACTIVE" &&
      tokens.every((t) =>
        `${m.name} ${m.code} ${m.kind}`
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(t),
      ),
  );
}
export function materialCostIssue(m: Material): string | null {
  if (m.unitCost != null) return null; // An explicit zero cost is valid, not a missing price.
  return m.kind === "PREPARED"
    ? `${m.name}: cost is unavailable. Complete its batch formulation, measured yield and input costs in Prepared Ingredients.`
    : `${m.name}: cost is unavailable. Set its purchase price, usable quantity and GST basis in ${m.kind === "PACKAGING" ? "Packaging & Supplies" : "Raw Ingredients"}.`;
}
// Quantity conversion only, never monetary calculation. A saved kg/l/dozen line
// must retain its physical amount when the editor displays the material's unit.
export function lineInMaterialUnit(line: Line, material: Material): Line {
  if (line.unit === material.unit_code) return { ...line };
  const from = factors[line.unit],
    to = factors[material.unit_code];
  if (!from || !to || from.dimension !== to.dimension)
    throw new Error(
      `${material.name}: saved quantity ${line.quantity} ${line.unit} is incompatible with its ${material.unit_code} costing unit. Enter an actual measured quantity; grams and millilitres are not interchangeable.`,
    );
  if (!/^\d+(?:\.\d{1,8})?$/.test(line.quantity))
    throw new Error(
      `${material.name}: enter a valid quantity in ${material.unit_code}.`,
    );
  const [whole, fraction = ""] = line.quantity.split(".");
  const numerator = BigInt(whole! + fraction.padEnd(8, "0")) * from.factor;
  if (numerator % to.factor !== 0n)
    throw new Error(
      `${material.name}: saved quantity ${line.quantity} ${line.unit} cannot be represented exactly in ${material.unit_code} at the supported precision. Enter the measured quantity in ${material.unit_code} before saving.`,
    );
  const value = (numerator / to.factor).toString().padStart(9, "0");
  const decimals = value.slice(-8).replace(/0+$/, "");
  return {
    ...line,
    quantity: `${value.slice(0, -8)}${decimals ? `.${decimals}` : ""}`,
    unit: material.unit_code,
  };
}
export function formulationIssue(
  lines: Line[],
  materials: Material[],
): string | null {
  if (!lines.length) return "Add at least one ingredient or packaging item.";
  for (const line of lines) {
    const m = materials.find(
      (m) => m.id === line.materialId && m.status === "ACTIVE",
    );
    if (!m)
      return "Choose an active ingredient or packaging item for every line.";
    const missing = materialCostIssue(m);
    if (missing) return missing;
    try {
      lineInMaterialUnit(line, m);
    } catch (error) {
      return (error as Error).message;
    }
  }
  return null;
}
export function prepareFormulationLines(
  lines: Line[],
  materials: Material[],
): Line[] {
  const issue = formulationIssue(lines, materials);
  if (issue) throw new Error(issue);
  return lines.map((line) =>
    lineInMaterialUnit(
      line,
      materials.find((m) => m.id === line.materialId)!,
    ),
  );
}

export function selectLineMaterial(
  line: Line,
  current: Material | undefined,
  next: Material | null,
): Line {
  let quantity = line.quantity;
  if (current) {
    try {
      quantity = lineInMaterialUnit(line, current).quantity;
    } catch {
      quantity = "";
    }
  }
  return {
    materialId: next?.id ?? "",
    quantity,
    unit: next?.unit_code ?? current?.unit_code ?? line.unit,
  };
}
