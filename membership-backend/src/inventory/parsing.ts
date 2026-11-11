import ExcelJS from "exceljs";
import JSZip from "jszip";
import path from "node:path";
import { Decimal } from "../costing/decimal.js";
import { decimal, ensure, text, choice } from "../costing/validation.js";
export type BaseUnit = "g" | "ml" | "each";
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
export const headers = [
  "物料编码",
  "物料名称",
  "类型",
  "每包装含量",
  "每包装价格（NZD）",
  "包装数量",
  "实盘总量",
  "盘点日期",
  "备注",
];
export const englishHeaders = [
  "Material Code",
  "Material Name",
  "Type",
  "Pack Contents",
  "Pack Price (NZD)",
  "Pack Count",
  "Total Counted Quantity",
  "Count Date",
  "Notes",
];
export function dateOnly(value: unknown): string {
  ensure(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a date in YYYY-MM-DD format.",
  );
  const parsed = new Date(value + "T00:00:00Z");
  ensure(
    !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value,
    "Invalid date.",
  );
  return value;
}
export function todayNZ() {
  const p = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = (t: string) => p.find((p) => p.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}
export function bounded(value: Decimal, base?: BaseUnit): string {
  const result = value.toFixed(8);
  decimal(result);
  ensure(
    Decimal.of(result).compare(value) === 0,
    "Stock quantities support up to eight decimal places. Reduce the input precision.",
  );
  if (base === "each")
    ensure(
      value.denominator === 1n,
      "Individual packaging counts must be whole numbers.",
    );
  return result;
}
export function measure(
  value: unknown,
  allowZero = false,
): { quantity: string; unit: BaseUnit; source: string } {
  const source = text(value, 100);
  const match = /^(\d+(?:\.\d{1,8})?)\s*(kg|g|ml|l|个|each)$/i.exec(source);
  ensure(match, "Enter contents such as 100g, 2.5kg, 1L, 500ml or 50each.");
  const q = decimal(match[1]!, !allowZero);
  const u = match[2]!.toLowerCase();
  const base: BaseUnit =
    u === "kg" || u === "g" ? "g" : u === "l" || u === "ml" ? "ml" : "each";
  return {
    quantity: bounded(
      Decimal.of(q).mul(Decimal.of(u === "kg" || u === "l" ? "1000" : "1")),
      base,
    ),
    unit: base,
    source,
  };
}
export function normalizeRow(raw: Record<string, unknown>, row = 2): ImportRow {
  const optional = (v: unknown) => (v == null ? "" : String(v).trim());
  const code = text(raw.code, 50);
  ensure(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code),
    "Material codes may contain letters, numbers, hyphens and underscores.",
  );
  return {
    row,
    code,
    name: text(raw.name),
    kind: choice(raw.kind, ["RAW", "PACKAGING"]),
    packText: optional(raw.packText),
    amount: optional(raw.amount),
    packages: optional(raw.packages),
    totalText: optional(raw.totalText),
    date: optional(raw.date),
    notes: optional(raw.notes).slice(0, 500),
  };
}
export function stockInput(row: ImportRow) {
  const hasPackages = row.packages !== "";
  const hasTotal = row.totalText !== "";
  ensure(
    !(hasPackages && hasTotal),
    "Enter either pack count or total counted quantity, not both.",
  );
  const spec = row.packText ? measure(row.packText) : null;
  if (row.amount !== "") decimal(row.amount);
  if (!hasPackages && !hasTotal) return { spec, stock: null, date: null };
  const observed = dateOnly(row.date);
  ensure(observed <= todayNZ(), "The count date cannot be in the future.");
  if (hasTotal) {
    const total = measure(row.totalText, true);
    ensure(
      !spec || spec.unit === total.unit,
      "Total counted quantity and pack contents have different unit dimensions.",
    );
    return {
      spec,
      stock: { quantity: total.quantity, unit: total.unit },
      date: observed,
    };
  }
  ensure(spec, "Pack contents are required when entering pack counts.");
  const packages = decimal(row.packages);
  return {
    spec,
    stock: {
      quantity: bounded(
        Decimal.of(spec.quantity).mul(Decimal.of(packages)),
        spec.unit,
      ),
      unit: spec.unit,
    },
    date: observed,
  };
}
// ExcelJS expects unprefixed SpreadsheetML tags. Some valid exports use x:.
// Normalize only the declared SpreadsheetML element namespace in memory;
// cell text and the original uploaded file are never rewritten.
export async function readableWorkbook(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  ensure(
    entries.length <= 200,
    "The workbook contains too many internal files.",
  );
  let size = 0;
  for (const entry of entries) {
    const uncompressed = (entry as any)._data?.uncompressedSize ?? 0;
    size += uncompressed;
    ensure(
      uncompressed <= 20 * 1024 * 1024 && size <= 30 * 1024 * 1024,
      "The workbook contents are too large after decompression.",
    );
    if (entry.dir) continue;
    if (entry.name.endsWith(".rels")) {
      const xml = await entry.async("string");
      const folder = path.posix.dirname(path.posix.dirname(entry.name));
      zip.file(
        entry.name,
        xml.replace(
          /Target="\/([^"<>]+)"/g,
          (_all, target: string) =>
            `Target="${path.posix.relative(folder === "." ? "" : folder, target)}"`,
        ),
      );
      continue;
    }
    if (!entry.name.endsWith(".xml")) continue;
    let xml = await entry.async("string");
    ensure(
      !/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml),
      "Use standard Excel XML without entity declarations or CDATA.",
    );
    const declarations = [
      ...xml.matchAll(
        /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g,
      ),
    ];
    for (const prefix of new Set(declarations.map((m) => m[1]!))) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bindings = [
        ...xml.matchAll(
          new RegExp("xmlns:" + escaped + "=[\"']([^\"']+)[\"']", "g"),
        ),
      ];
      ensure(
        bindings.every(
          (m) =>
            m[1] ===
            "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        ),
        "The workbook contains conflicting XML namespaces.",
      );
      xml = xml
        .replace(new RegExp("<(/?)" + escaped + ":", "g"), "<$1")
        .replace(new RegExp("xmlns:" + escaped + "=", "g"), "xmlns=");
    }
    zip.file(entry.name, xml);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}
export async function parseWorkbook(buffer: Buffer): Promise<ImportRow[]> {
  ensure(
    buffer.length > 0 &&
      buffer.length <= 3 * 1024 * 1024 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b,
    "Upload an .xlsx file no larger than 3MB.",
  );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load((await readableWorkbook(buffer)) as any);
  } catch {
    ensure(
      false,
      "Unable to read the workbook. Check that it is a valid .xlsx file.",
    );
  }
  const sheet =
    workbook.getWorksheet("Inventory") ??
    workbook.getWorksheet("库存登记") ??
    workbook.worksheets[0];
  ensure(sheet, "The workbook has no worksheets.");
  ensure(
    sheet.rowCount <= 1001,
    "Import up to 1,000 rows at a time. Remove extra formatted blank rows or split the workbook.",
  );
  const cell = (r: number, c: number): string => {
    const value = sheet.getCell(r, c).value;
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    ensure(
      typeof value === "string" || typeof value === "number",
      "Cells must contain plain text or numbers, without formulas, links or rich text.",
    );
    return String(value).trim();
  };
  ensure(
    [englishHeaders, headers].some((labels) =>
      labels.every((header, i) => cell(1, i + 1) === header),
    ),
    "Headers do not match. Use the nine-column inventory template including Total Counted Quantity.",
  );
  const result: ImportRow[] = [];
  const seen = new Set<string>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = headers.map((_, i) => cell(r, i + 1));
    if (values.every((v) => !v)) continue;
    const row = normalizeRow(
      {
        code: values[0],
        name: values[1],
        kind: [
          "物料",
          "raw ingredient",
          "raw ingredients",
          "raw",
          "material",
        ].includes(values[2]!.toLowerCase())
          ? "RAW"
          : ["包装", "packaging"].includes(values[2]!.toLowerCase())
            ? "PACKAGING"
            : values[2],
        packText: values[3],
        amount: values[4],
        packages: values[5],
        totalText: values[6],
        date: values[7],
        notes: values[8],
      },
      r,
    );
    ensure(
      !seen.has(row.code.toUpperCase()),
      `Duplicate code at row ${r}: ${row.code}`,
    );
    seen.add(row.code.toUpperCase());
    result.push(row);
  }
  ensure(result.length > 0, "The workbook contains no readable materials.");
  return result;
}
