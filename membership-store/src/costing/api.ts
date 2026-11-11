import { API_BASE_URL } from "../config/api";
export async function costingRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/staff/costing${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("staff_token") ?? ""}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 401) {
    localStorage.removeItem("staff_token");
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  if (!response.ok)
    throw new Error(result.message ?? "Unable to load Recipe Costing.");
  return result.data as T;
}
export type Unit = "g" | "kg" | "ml" | "l" | "each" | "dozen";
export const units: Unit[] = ["g", "kg", "ml", "l", "each", "dozen"];
export type Tax = "EXCLUSIVE" | "INCLUSIVE" | "";
export interface Location {
  brandId: string;
  brandName: string;
  locationId: string;
  locationName: string;
  currency: string;
  permission: "VIEWER" | "EDITOR" | "ADMIN";
}
export interface Material {
  id: string;
  code: string;
  name: string;
  kind: "RAW" | "PREPARED" | "PACKAGING";
  unit_code: Unit;
  status: string;
  row_version: number;
  unitCost: string | null;
  costError: string | null;
}
export interface Line {
  materialId: string;
  quantity: string;
  unit: Unit;
}
export interface DbLine {
  id: string;
  material_id?: string;
  input_material_id?: string;
  quantity: string;
  unit_code: Unit;
}
export interface Head {
  id: string;
  row_version: number;
  price_id?: string;
  preparation_revision_id?: string;
  yield_measurement_id?: string;
  recipe_revision_id?: string;
}
export interface Yield {
  id: string;
  preparation_revision_id: string;
  quantity: string;
  unit_code: Unit;
  measured_at: string;
  notes: string | null;
}
export interface Revision {
  id: string;
  revision: number;
  instructions?: string;
  created_at: string;
}
export interface PriceRow {
  id: string;
  amount: string;
  usable_quantity: string;
  unit_code: Unit;
  tax_basis: Tax;
  gst_rate: string;
  notes: string | null;
  created_at: string;
}
export interface MaterialDetail {
  inventorySpec?: {
    id: string;
    itemId: string;
    quantity: string;
    unit: Unit;
    sourceText: string;
    compatible: boolean;
  } | null;
  material: Material;
  prices: PriceRow[];
  priceHead: Head | null;
  head: Head | null;
  revisions: Revision[];
  measurements: Yield[];
  lines: DbLine[];
}
export interface Size {
  id: string;
  code: string;
  label: string;
  nominal_volume_ml: string | null;
}
export interface Product {
  id: string;
  code: string;
  name: string;
  price: string;
  category: string | null;
}
export interface Recipe {
  id: string;
  name: string;
  status: string;
  row_version: number;
}
export interface Variant {
  id: string;
  size_id: string;
  size_label: string;
  product_id: string | null;
  price_source: "PRODUCT" | "OVERRIDE";
  price_override: string | null;
  tax_basis: Tax;
  gst_rate: string;
  row_version: number;
  head: Head | null;
  lines: DbLine[];
  revisions: Revision[];
}
export interface RecipeDetail {
  recipe: Recipe;
  variants: Variant[];
}
export interface Group {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
}
export interface Option {
  id: string;
  option_group_id: string;
  name: string;
  kind: string;
}
export interface Effect {
  operation: "ADD" | "REMOVE" | "REPLACE" | "SET_QUANTITY";
  targetLineId?: string;
  materialId?: string;
  quantity?: string;
  unit?: Unit;
}
export interface StoredEffect {
  id: string;
  operation: Effect["operation"];
  target_line_id: string | null;
  material_id: string | null;
  quantity: string | null;
  unit_code: Unit | null;
  recipe_revision_id: string;
}
export interface AttachedOption {
  id: string;
  option_id: string;
  option_group_id: string;
  name: string;
  kind: string;
  is_default: number;
  max_portions: number;
  price_adjustment: string;
  tax_basis: Tax;
  gst_rate: string;
  effects: StoredEffect[];
}
export interface VariantOptions {
  groups: Group[];
  options: AttachedOption[];
}
export interface Cost {
  cost: string;
  revenue: string;
  grossProfit: string;
  marginPercent: string | null;
  surchargeExclusive: string;
  retailPrice: string;
  taxBasis: Tax;
  gstRate: string;
  calculatedAt: string;
  recipeRevisionId: string;
  breakdown: (Line & { cost: string })[];
}
export interface ProfitRow {
  id: string;
  name: string;
  size: string;
  costing: Cost | null;
  error: string | null;
}
export interface Libraries {
  materials: Material[];
  sizes: Size[];
  recipes: Recipe[];
  groups: Group[];
  options: Option[];
  products: Product[];
  profits: ProfitRow[];
}
export const emptyLibraries: Libraries = {
  materials: [],
  sizes: [],
  recipes: [],
  groups: [],
  options: [],
  products: [],
  profits: [],
};
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete this action.";
export const mapLine = (line: DbLine): Line => ({
  materialId: String(line.material_id ?? line.input_material_id),
  quantity: line.quantity,
  unit: line.unit_code,
});
// Display only. Monetary calculations are performed exactly by the backend.
export const money = (value: string | null | undefined, currency = "NZD") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value));

// Presentation only: do not use formatted values in calculations or saved payloads.
export const decimalDisplay = (
  value: string | number | null | undefined,
  empty = "—",
) =>
  value == null || String(value).trim() === ""
    ? empty
    : Number.isFinite(Number(value))
      ? new Intl.NumberFormat("en-NZ", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        }).format(Number(value))
      : String(value);
