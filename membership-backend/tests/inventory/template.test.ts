import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  createPriceTemplate,
  templateRow,
  type TemplateMaterial,
} from "../../src/inventory/template.js";
import { parseWorkbook, stockInput } from "../../src/inventory/parsing.js";
const material: TemplateMaterial = {
  code: "TEA",
  name: "Tea leaves",
  kind: "RAW",
  spec_quantity: "2000.00000000",
  spec_unit: "g",
  amount: "11.50000000",
  usable_quantity: "1000.00000000",
  price_unit: "g",
  tax_basis: "INCLUSIVE",
  gst_rate: "0.15000000",
};
test("template prices use current pack contents and consistent GST-exclusive amounts", () => {
  const row = templateRow(material);
  assert.equal(row[3], "2000g");
  assert.equal(row[4], "20");
  assert.deepEqual(row.slice(5, 8), ["", "", ""]);
  assert.equal(templateRow({ ...material, amount: "0" })[4], "0");
  assert.equal(templateRow({ ...material, amount: null })[4], "");
  assert.equal(
    templateRow({ ...material, tax_basis: "EXCLUSIVE", gst_rate: "0" })[4],
    "23",
  );
});
test("unknown packaging specs never use stock totals as price denominators", () => {
  const row = templateRow({
    ...material,
    kind: "PACKAGING",
    spec_quantity: null,
    spec_unit: null,
    amount: null,
    usable_quantity: null,
    price_unit: null,
    tax_basis: null,
    gst_rate: null,
  });
  assert.equal(row[3], "");
  assert.equal(row[4], "");
  assert.match(row[8]!, /100each/);
  const oldPrice = templateRow({
    ...material,
    kind: "PACKAGING",
    spec_quantity: null,
    spec_unit: null,
    usable_quantity: "2",
    price_unit: "dozen",
    amount: "24",
    tax_basis: "EXCLUSIVE",
  });
  assert.equal(oldPrice[3], "24each");
  assert.equal(oldPrice[4], "24");
});
test("incompatible mass and volume prices stay blank with a warning", () => {
  const row = templateRow({ ...material, price_unit: "ml" });
  assert.equal(row[3], "2000g");
  assert.equal(row[4], "");
  assert.match(row[8]!, /incompatible/);
});
test("download is an English XLSX template that round-trips without stock counts or formulas", async () => {
  const buffer = await createPriceTemplate([material]);
  const rows = await parseWorkbook(buffer);
  assert.equal(rows[0]?.amount, "20");
  assert.equal(stockInput(rows[0]!).stock, null);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(buffer as any);
  assert.ok(w.getWorksheet("Instructions"));
  assert.equal(
    w.getWorksheet("Inventory")?.getCell("C2").dataValidation.type,
    "list",
  );
  const empty = await createPriceTemplate([]);
  const e = new ExcelJS.Workbook();
  await e.xlsx.load(empty as any);
  assert.equal(
    e.getWorksheet("Inventory")?.getCell("A1").value,
    "Material Code",
  );
});

test("export preserves existing specification labels and never rounds a positive price to free", () => {
  assert.equal(
    templateRow({
      ...material,
      spec_quantity: "1000.00000000",
      spec_source: "1kg",
    })[3],
    "1kg",
  );
  const row = templateRow({
    ...material,
    amount: "0.00000001",
    spec_quantity: "1",
    usable_quantity: "1000",
    tax_basis: "EXCLUSIVE",
  });
  assert.equal(row[4], "");
  assert.match(row[8]!, /precision/);
});
