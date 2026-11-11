import { API_BASE_URL } from "../config/api";
import type { Location, Material } from "../costing/api";
export type { Location, Material };
export interface Item {
  id: string;
  material_id: string;
  code: string;
  name: string;
  kind: "RAW" | "PACKAGING";
  base_unit: "g" | "ml" | "each";
  status: string;
  row_version: number;
  quantity: string | null;
  balance_version: number | null;
  minimum_quantity: string | null;
  stock_status: "UNKNOWN" | "LOW" | "OK";
  current_spec_id: string | null;
  pack_quantity: string | null;
  pack_unit: string | null;
  source_text: string | null;
  cost_price: string | null;
  price_quantity: string | null;
  price_unit: string | null;
  price_tax_basis?: string | null;
  costing_unit: string;
  material_status: string;
}
export interface Spec {
  id: string;
  item_id: string;
  version: number;
  quantity: string;
  unit_code: "g" | "ml" | "each";
  source_text: string;
  created_at: string;
}
export interface Movement {
  id: string;
  item_id: string;
  action: string;
  quantity_delta: string;
  quantity_before: string | null;
  quantity_after: string;
  unit_code: string;
  observed_date: string;
  reason: string;
  created_by: string;
  created_at: string;
  reversal_of: string | null;
  code?: string;
  name?: string;
}
export interface Detail {
  item: Item;
  material: {
    id: string;
    name: string;
    code: string;
    kind: string;
    unit_code: string;
    status: string;
  };
  balance: { quantity: string; row_version: number } | null;
  spec: Spec | null;
  specs: Spec[];
  movements: Movement[];
}
export interface ImportRow {
  row: number;
  code: string;
  name: string;
  kind: "RAW" | "PACKAGING";
  packText: string;
  amount: string;
  packages: string;
  totalText: string;
  date: string;
  notes: string;
}
export interface PreviewRow {
  row: number;
  code: string;
  name: string;
  kind: string;
  status: "READY" | "ERROR" | "SKIP";
  message: string;
  materialId?: string | null;
  materialName?: string | null;
  itemId?: string | null;
  baseUnit?: string;
  stock?: { quantity: string; unit: string } | null;
  spec?: { quantity: string; unit: string; source: string } | null;
  amount?: string;
  canSyncPrice?: boolean;
  changesStock?: boolean;
  changesPrice?: boolean;
  currentStock?: string | null;
  resultingStock?: string | null;
  observedDate?: string | null;
  currentPrice?: {
    amount: string;
    quantity: string;
    unit: string;
    taxBasis: string;
    gstRate: string;
  } | null;
  nextPrice?: {
    amount: string;
    quantity: string;
    unit: string;
    taxBasis: string;
    gstRate: string;
  } | null;
  warnings: string[];
  candidates: { id: string; name: string; code: string; kind: string }[];
}
export type ImportMode = "STOCKTAKE" | "RECEIPT";
export interface ImportResult {
  mode?: ImportMode;
  batchId?: string | null;
  itemsCreated: number;
  linkedMaterials: number;
  stockCounts: number;
  prices: number;
  pricesDeferred: number;
  skipped: number;
  importId: string;
  duplicate?: boolean;
}
export interface Preview {
  mode?: ImportMode;
  batchId?: string | null;
  previewToken?: string;
  id: string;
  completed: boolean;
  plans: PreviewRow[];
  result?: ImportResult;
  summary?: {
    ready: number;
    skipped: number;
    errors: number;
    stockCounts: number;
    prices: number;
  };
}
async function responseData<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    localStorage.removeItem("staff_token");
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      "The server response could not be read. Refresh and try again.",
    );
  }
  if (!response.ok)
    throw new Error(value.message ?? "Inventory operation failed.");
  return value.data as T;
}
export async function inventoryRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return responseData<T>(
    await fetch(`${API_BASE_URL}/api/staff/inventory${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("staff_token") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
export async function uploadInventory(
  path: string,
  file: File,
): Promise<ImportRow[]> {
  if (file.size > 3 * 1024 * 1024)
    throw new Error("Excel files must not exceed 3MB.");
  return responseData<ImportRow[]>(
    await fetch(`${API_BASE_URL}/api/staff/inventory${path}/imports/parse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("staff_token") ?? ""}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: await file.arrayBuffer(),
    }),
  );
}
export const unitLabel = (u: string) =>
  u === "each" ? "each" : u === "l" ? "L" : u;
export const actionLabel = (action: string) =>
  ({
    OPENING: "Opening count",
    RECEIPT: "Receipt",
    ISSUE: "Issue",
    WASTE: "Waste",
    COUNT: "Stocktake adjustment",
    REVERSAL: "Reversal",
  })[action] ?? action;
export function todayNZ() {
  const p = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = (type: string) => p.find((p) => p.type === type)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

export async function downloadInventoryTemplate(path: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/staff/inventory${path}/imports/template`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("staff_token") ?? ""}`,
      },
    },
  );
  if (!response.ok) return responseData<never>(response);
  return response.blob();
}
