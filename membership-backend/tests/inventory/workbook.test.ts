import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { headers, parseWorkbook } from "../../src/inventory/parsing.js";
async function workbook(rows: unknown[][]) {
  const w = new ExcelJS.Workbook();
  const s = w.addWorksheet("库存登记");
  s.addRow(headers);
  for (const row of rows) s.addRow(row);
  return Buffer.from(await w.xlsx.writeBuffer());
}
test("reads ordinary Excel workbooks with plain cells and ISO dates", async () => {
  const b = await workbook([
    ["TEA", "茶叶", "物料", "1kg", 10, 2, "", "2026-11-08", ""],
  ]);
  const rows = await parseWorkbook(b);
  assert.equal(rows[0]?.amount, "10");
  assert.equal(rows[0]?.packText, "1kg");
});
test("rejects formula cells, unknown kinds, duplicate codes and changed headers", async () => {
  await assert.rejects(() =>
    workbook([
      [
        "TEA",
        "茶叶",
        "物料",
        "1kg",
        { formula: "1+1", result: 2 },
        2,
        "",
        "2026-11-08",
        "",
      ],
    ]).then(parseWorkbook),
  );
  await assert.rejects(() =>
    workbook([["TEA", "茶叶", "饮料"]]).then(parseWorkbook),
  );
  await assert.rejects(() =>
    workbook([
      ["TEA", "茶叶", "物料"],
      ["tea", "重复", "物料"],
    ]).then(parseWorkbook),
  );
  const w = new ExcelJS.Workbook();
  w.addWorksheet("库存登记").addRow(["不同的表头"]);
  await assert.rejects(() =>
    w.xlsx.writeBuffer().then((b) => parseWorkbook(Buffer.from(b))),
  );
});

test("supports English workbook headers, material types and count units", async () => {
  const { englishHeaders } = await import("../../src/inventory/parsing.js");
  const w = new ExcelJS.Workbook();
  const sheet = w.addWorksheet("Inventory");
  sheet.addRow(englishHeaders);
  sheet.addRow([
    "TEA",
    "Tea leaves",
    "Raw ingredient",
    "1kg",
    10,
    2,
    "",
    "2026-11-08",
    "",
  ]);
  sheet.addRow([
    "CUP",
    "Cup",
    "Packaging",
    "",
    "",
    "",
    "298each",
    "2026-11-08",
    "",
  ]);
  const rows = await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));
  assert.equal(rows[0]?.kind, "RAW");
  assert.equal(rows[1]?.kind, "PACKAGING");
  assert.equal(rows[1]?.totalText, "298each");
});
