import ExcelJS from "exceljs";
import { Decimal } from "../costing/decimal.js";
import {
  convert,
  exclusive,
  type Unit,
  type TaxBasis,
} from "../costing/calculator.js";
import { decimal, ensure } from "../costing/validation.js";
import { englishHeaders, measure } from "./parsing.js";

export interface TemplateMaterial {
  code: string;
  name: string;
  kind: "RAW" | "PACKAGING";
  spec_quantity: string | null;
  spec_unit: Unit | null;
  spec_source?: string | null;
  amount: string | null;
  usable_quantity: string | null;
  price_unit: Unit | null;
  tax_basis: TaxBasis | null;
  gst_rate: string | null;
}
const compact = (value: string) =>
  value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;

// Export only editable price inputs, never current balances as stocktake values.
export function templateRow(material: TemplateMaterial): string[] {
  let contents = "",
    amount = "";
  const notes: string[] = [];
  let quantity = material.spec_quantity;
  let unit = material.spec_unit;
  if (!quantity && material.usable_quantity && material.price_unit) {
    unit = ["g", "kg"].includes(material.price_unit)
      ? "g"
      : ["ml", "l"].includes(material.price_unit)
        ? "ml"
        : "each";
    quantity = convert(
      material.usable_quantity,
      material.price_unit,
      unit,
    ).toFixed(8);
  }
  if (quantity && unit) {
    try {
      contents = `${compact(quantity)}${unit}`;
      measure(contents);
      if (material.spec_source) {
        const source = measure(material.spec_source);
        if (
          source.unit === unit &&
          Decimal.of(source.quantity).compare(Decimal.of(quantity)) === 0
        )
          contents = material.spec_source;
      }
    } catch {
      contents = "";
      notes.push("Enter valid pack contents before updating the price.");
    }
  }
  if (
    material.amount != null &&
    material.usable_quantity &&
    material.price_unit &&
    contents &&
    material.tax_basis &&
    material.gst_rate != null
  ) {
    try {
      const usable = convert(
        material.usable_quantity,
        material.price_unit,
        unit!,
      );
      const normalized = exclusive({
        amount: material.amount,
        taxBasis: material.tax_basis,
        gstRate: material.gst_rate,
      })
        .div(usable)
        .mul(Decimal.of(quantity!));
      const rounded = normalized.toFixed(8);
      decimal(rounded);
      ensure(
        normalized.compare(Decimal.of("0")) === 0 ||
          Decimal.of(rounded).compare(Decimal.of("0")) > 0,
        "Price is below the supported precision.",
      );
      amount = compact(rounded);
    } catch {
      amount = "";
      notes.push(
        "Price omitted: units are incompatible or the normalized price exceeds the supported precision. No mass-to-volume conversion is assumed.",
      );
    }
  }
  if (!contents && material.kind === "PACKAGING")
    notes.push(
      "Enter 1each for a per-item price, or the actual pack size (for example, 100each).",
    );
  return [
    material.code,
    material.name,
    material.kind === "RAW" ? "Raw ingredient" : "Packaging",
    contents,
    amount,
    "",
    "",
    "",
    notes.join(" "),
  ];
}
export async function createPriceTemplate(
  materials: TemplateMaterial[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Member2Go";
  const sheet = workbook.addWorksheet("Inventory", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(englishHeaders);
  materials.forEach((material) => sheet.addRow(templateRow(material)));
  sheet.columns.forEach((column, index) => {
    column.width = [22, 30, 19, 20, 21, 18, 25, 18, 60][index]!;
  });
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF285B47" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.autoFilter = {
    from: "A1",
    to: `I${Math.max(materials.length + 1, 1)}`,
  };
  const last = Math.min(1001, Math.max(101, materials.length + 101));
  for (let row = 2; row <= last; row++) {
    sheet.getCell(row, 3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Raw ingredient,Packaging"'],
    };
    sheet.getCell(row, 5).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Invalid price",
      error: "Enter a non-negative price or leave it blank.",
    };
  }
  const info = workbook.addWorksheet("Instructions");
  const instructions = [
    ["Member2Go inventory price update template"],
    [
      "Price basis",
      "All exported prices are GST exclusive (NZD), normalized to the exported Pack Contents. Select GST exclusive when uploading.",
    ],
    [
      "Price updates",
      "Edit Pack Price (NZD). Keep codes and material names unchanged. Blank prices leave existing costs unchanged; an explicit 0 is a zero price.",
    ],
    [
      "Stock protection",
      "Pack Count, Total Counted Quantity and Count Date are intentionally blank. Leave them blank for price-only updates; current stock will not change.",
    ],
    [
      "Packaging example",
      "For lids priced individually, enter 1each in Pack Contents. For a 100-lid pack, enter 100each and the price for that whole pack. Never use remaining stock as pack contents.",
    ],
    [
      "Stocktake or Receipt",
      "Choose Stocktake to SET actual stock, or Stock Receipt to ADD incoming stock. Use Pack Count with Pack Contents, or Total Counted Quantity with a unit (for example 298each). Count Date is the movement date (YYYY-MM-DD). Receipts require known opening stock and a unique delivery batch reference in the application.",
    ],
    [
      "Units",
      "Use g, kg, ml, L or each. Only kg to g and L to ml are converted. Mass and volume are never assumed equivalent.",
    ],
    [
      "Missing specifications",
      "Unknown pack contents and prices remain blank. Incompatible prices are omitted with a note; confirm actual usable quantity separately.",
    ],
    [
      "Adding materials",
      "Add rows using a unique code and Raw ingredient or Packaging type. Establish opening stock with Stocktake (zero is allowed) before importing a receipt. Rows with no quantity and no enabled price update make no changes.",
    ],
    [
      "Precision",
      "Values are plain text to preserve exact input precision. No formulas are required. The interface displays two decimal places.",
    ],
    [
      "Confirm",
      "Upload the Inventory sheet, inspect the preview and confirm. Downloading this workbook does not change any records.",
    ],
  ];
  instructions.forEach((row) => info.addRow(row));
  info.getColumn(1).width = 28;
  info.getColumn(2).width = 110;
  info.eachRow((row, index) => {
    row.height = index === 1 ? 30 : 62;
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: "FF285B47" } };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
