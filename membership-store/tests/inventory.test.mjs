import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
});
try {
  const { InventoryTable } = await server.ssrLoadModule(
    "/src/inventory/InventoryPage.tsx",
  );
  const { MovementTable, ItemSetup } = await server.ssrLoadModule(
    "/src/inventory/ItemForms.tsx",
  );
  const { PriceForm } = await server.ssrLoadModule(
    "/src/costing/Materials.tsx",
  );
  const { ImportPanel } = await server.ssrLoadModule(
    "/src/inventory/ImportPanel.tsx",
  );
  const render = (C, props) =>
    renderToStaticMarkup(React.createElement(C, props));
  const item = {
    id: "1",
    code: "TEA",
    name: "Tea leaves",
    kind: "RAW",
    base_unit: "g",
    status: "ACTIVE",
    row_version: 1,
    quantity: null,
    balance_version: null,
    minimum_quantity: null,
    stock_status: "UNKNOWN",
    source_text: "1kg",
    cost_price: null,
    price_quantity: null,
  };
  test("stock table distinguishes unknown quantities, zero and unknown prices without quantity rounding", () => {
    const html = render(InventoryTable, {
      items: [
        item,
        {
          ...item,
          id: "2",
          name: "Zero stock",
          quantity: "0.00000000",
          cost_price: "0.00000000",
          stock_status: "LOW",
          minimum_quantity: "2.12345",
        },
      ],
      canEdit: true,
      onAction() {},
    });
    assert.match(html, /Not counted/);
    assert.match(html, /0 g/);
    assert.match(html, /2.12345 g/);
    assert.match(html, /Unknown/);
    assert.match(html, /Low stock/);
    assert.match(html, /Stock operation/);
    assert.doesNotMatch(html, /0\.00000000 g/);
    assert.doesNotMatch(html, /[\p{Script=Han}]/u);
  });
  test("viewer has history access but no write controls", () => {
    const html = render(InventoryTable, {
      items: [item],
      canEdit: false,
      onAction() {},
    });
    assert.match(html, /History/);
    assert.doesNotMatch(html, /Stock operation|Archive|Settings<\/button>/);
  });
  test("movement ledger shows signed values and retained reversal links", () => {
    const html = render(MovementTable, {
      movements: [
        {
          id: "1",
          item_id: "1",
          action: "REVERSAL",
          quantity_delta: "-2.12345",
          quantity_before: "10",
          quantity_after: "7.87655",
          unit_code: "g",
          observed_date: "2026-11-09",
          reason: "Correction",
          created_by: "1",
          reversal_of: "2",
        },
      ],
    });
    assert.match(html, /-2.12345/);
    assert.match(html, /7.87655/);
    assert.match(html, /Original movement #2/);
  });
  test("import defaults to explicitly confirmed exclusive prices and editable GST 0.15", () => {
    const html = render(ImportPanel, {
      base: "/brands/1/locations/1",
      materials: [],
      saved: async () => {},
    });
    assert.match(html, /<option value="EXCLUSIVE" selected="">/);
    assert.match(html, /value="0.15"/);
    assert.match(html, /zero GST rate/);
    assert.match(html, /Download current template/);
    assert.match(html, /<option value="STOCKTAKE" selected="">/);
    assert.match(html, /Stock Receipt/);
    assert.match(html, /A batch with errors cannot be confirmed/);
    assert.match(html, /Stock fields are left blank/);
    assert.match(html, /Blank quantities and prices remain unknown/);
    assert.doesNotMatch(html, /[\p{Script=Han}]/u);
  });
  test("linked price entry uses immutable inventory specification and preserves configured zero GST", () => {
    const detail = {
      material: { id: "1", unit_code: "g" },
      prices: [
        {
          id: "2",
          amount: "10",
          usable_quantity: "1000",
          unit_code: "g",
          tax_basis: "EXCLUSIVE",
          gst_rate: "0",
          created_at: "2026-11-09",
        },
      ],
      priceHead: { price_id: "2", row_version: 1 },
      inventorySpec: {
        id: "3",
        itemId: "1",
        quantity: "1000",
        unit: "g",
        sourceText: "1kg",
        compatible: true,
      },
    };
    const html = render(PriceForm, {
      base: "/brands/1/locations/1",
      detail,
      canEdit: true,
      saved: async () => {},
    });
    assert.match(html, /Inventory pack specification/);
    assert.doesNotMatch(html, /<select[^>]*><option value="g"/);
    assert.match(html, /value="0"/);
    assert.doesNotMatch(html, /value="0.15"/);
  });
  test("shared catalog excludes prepared ingredients and archived materials", () => {
    const html = render(ItemSetup, {
      base: "/brands/1/locations/1",
      materials: [
        {
          id: "1",
          code: "TEA",
          name: "Tea leaves",
          kind: "RAW",
          unit_code: "g",
          status: "ACTIVE",
        },
        {
          id: "2",
          code: "PREPARED",
          name: "Prepared fixture",
          kind: "PREPARED",
          status: "ACTIVE",
        },
        {
          id: "3",
          code: "OLD",
          name: "Archive测试",
          kind: "RAW",
          status: "ARCHIVED",
        },
      ],
      saved: async () => {},
      close() {},
    });
    assert.match(html, /Tea leaves/);
    assert.doesNotMatch(html, /Prepared fixture|Archive测试/);
  });
} finally {
  await server.close();
}
