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
  const { Materials } = await server.ssrLoadModule(
    "/src/costing/Materials.tsx",
  );
  const { LineEditor, CostCard, DecimalInput, TaxFields } =
    await server.ssrLoadModule("/src/costing/components.tsx");
  const { Recipes } = await server.ssrLoadModule("/src/costing/Recipes.tsx");
  const { ReferenceLibrary } = await server.ssrLoadModule(
    "/src/costing/ReferenceLibrary.tsx",
  );
  const api = await server.ssrLoadModule("/src/costing/api.ts");
  const material = {
    id: "1",
    code: "TEA",
    name: "Jasmine leaves",
    kind: "RAW",
    unit_code: "g",
    status: "ACTIVE",
    row_version: 1,
    unitCost: null,
    costError: "Missing entered price.",
  };
  const materials = [
    material,
    {
      ...material,
      id: "2",
      name: "Prepared tea",
      kind: "PREPARED",
      unit_code: "ml",
      unitCost: "0.00500000",
    },
    {
      ...material,
      id: "3",
      name: "Cup",
      kind: "PACKAGING",
      unit_code: "each",
      unitCost: "0.10000000",
    },
    { ...material, id: "4", name: "Archived ingredient", status: "ARCHIVED" },
  ];
  const data = {
    materials,
    sizes: [],
    recipes: [],
    groups: [
      { id: "1", name: "Toppings", min_selections: 0, max_selections: 1 },
    ],
    options: [],
    products: [],
    profits: [],
  };
  const render = (Component, props) =>
    renderToStaticMarkup(React.createElement(Component, props));
  await test("costs retain precision, quantities trim zeros, and margins keep two places", () => {
    assert.equal(api.decimalDisplay("12.34567890"), "12.3456789");
    assert.equal(api.decimalDisplay("0.00500000"), "0.005");
    assert.equal(api.decimalDisplay("0"), "0");
    const original = "0.00500000";
    const input = render(DecimalInput, { value: original, onChange: () => {} });
    assert.match(input, /value="0.005"/);
    assert.equal(original, "0.00500000");
    const emptyTax = render(TaxFields, {
      tax: "",
      rate: "",
      onTax: () => {},
      onRate: () => {},
    });
    assert.match(emptyTax, /value=""/);
    assert.doesNotMatch(emptyTax, /value="0.00"/);
    const library = render(Materials, {
      base: "/test",
      data,
      kind: "PREPARED",
      canEdit: false,
      refresh: async () => {},
    });
    assert.match(library, /\$0\.0050/);
    assert.doesNotMatch(library, /0\.00500000/);
    const result = render(CostCard, {
      materials,
      cost: {
        cost: "2.12345678",
        revenue: "10.12345678",
        grossProfit: "8.00000000",
        marginPercent: "79.1234",
        calculatedAt: "2026-11-08T00:00:00Z",
        breakdown: [
          {
            materialId: "2",
            quantity: "400.12345678",
            unit: "ml",
            cost: "2.12345678",
          },
        ],
      },
    });
    assert.match(result, /400\.12345678/);
    assert.match(result, /79\.12%/);
    assert.match(result, /\$2\.12345678/);
    assert.equal(api.decimalDisplay("3000.00000000"), "3000");
    assert.equal(api.costMoney("0.00104000"), "$0.00104");
    assert.equal(api.costMoney("0.00000001"), "$0.00000001");
    assert.equal(api.costMoney("0.0000000000104"), "$0.0000000000104");
    assert.equal(api.costMoney("26"), "$26.0000");
    assert.equal(api.costMoney("0"), "$0.0000");
    assert.equal(api.costMoney(null), "—");
    assert.equal(
      api.decimalDisplay("999999999999.12345678"),
      "999999999999.12345678",
    );
    assert.equal(api.percentDisplay("90.6400"), "90.64");
  });
  await test("tea unit costs, tiny unit costs and final drink costs render without misleading zeros", () => {
    const leaves = { ...material, unitCost: "0.05200000" };
    const tea = { ...materials[1], unitCost: "0.00104000" };
    const tiny = {
      ...tea,
      id: "5",
      name: "Tiny preparation",
      unitCost: "0.0000000000104",
    };
    const raw = render(Materials, {
      base: "/test",
      data: { ...data, materials: [leaves, tea, tiny] },
      kind: "RAW",
      canEdit: false,
      refresh: async () => {},
    });
    const prepared = render(Materials, {
      base: "/test",
      data: { ...data, materials: [leaves, tea, tiny] },
      kind: "PREPARED",
      canEdit: false,
      refresh: async () => {},
    });
    assert.match(raw, /\$0\.0520/);
    assert.match(prepared, /\$0\.00104/);
    assert.match(prepared, /\$0\.0000000000104/);
    const drink = render(CostCard, {
      materials: [leaves, tea],
      cost: {
        cost: "0.46800000",
        revenue: "5.00000000",
        grossProfit: "4.53200000",
        marginPercent: "90.6400",
        calculatedAt: "2026-11-13T00:00:00Z",
        breakdown: [
          {
            materialId: tea.id,
            quantity: "450.00000000",
            unit: "ml",
            cost: "0.46800000",
          },
        ],
      },
    });
    assert.match(drink, /\$0\.4680/);
    assert.match(drink, /90\.64%/);
    assert.match(drink, /450 ml/);
    assert.doesNotMatch(drink, /450\.00000000/);
  });
  await test("viewer material library shows incomplete costs without mutation controls", () => {
    const html = render(Materials, {
      base: "/test",
      data,
      kind: "RAW",
      canEdit: false,
      refresh: async () => {},
    });
    assert.match(html, /Needs costing/);
    assert.match(html, /Jasmine leaves/);
    assert.doesNotMatch(html, />Edit<|>Archive<|\+ Add raw ingredient/);
    assert.doesNotMatch(html, /\$0\.00/);
  });
  await test("ingredient editor retains the three kinds and excludes archived inputs", () => {
    const html = render(LineEditor, {
      materials,
      lines: [{ materialId: "1", quantity: "100", unit: "g" }],
      onChange: () => {},
    });
    assert.match(html, /Jasmine leaves · raw/);
    assert.match(html, /Prepared tea · prepared/);
    assert.match(html, /Cup · packaging/);
    assert.doesNotMatch(html, /Archived ingredient/);
    assert.match(html, /value="ml"/);
    assert.match(html, /value="g"/);
  });
  await test("profit display uses server results and defines zero-revenue margins clearly", () => {
    const cost = {
      cost: "2.10000000",
      revenue: "10.00000000",
      grossProfit: "7.90000000",
      marginPercent: "79.0000",
      calculatedAt: "2026-11-04T00:00:00Z",
      breakdown: [
        { materialId: "2", quantity: "400", unit: "ml", cost: "2.00000000" },
      ],
    };
    const html = render(CostCard, { cost, materials });
    assert.match(html, /79\.00%/);
    assert.match(html, /Prepared tea/);
    assert.match(html, /400/);
    assert.match(html, /ex GST/);
    assert.match(
      render(CostCard, { cost: { ...cost, marginPercent: null }, materials }),
      /Undefined/,
    );
  });
  await test("viewer recipe and option pages have no creation controls", () => {
    assert.doesNotMatch(
      render(Recipes, {
        base: "/test",
        data,
        canEdit: false,
        refresh: async () => {},
      }),
      /Add drink|Manage sizes/,
    );
    const html = render(ReferenceLibrary, {
      base: "/test",
      type: "option-groups",
      data,
      canEdit: false,
      refresh: async () => {},
    });
    assert.match(html, /Toppings/);
    assert.doesNotMatch(html, /Add group|>Rename</);
  });
  await test("API client preserves decimal strings and surfaces validation errors", async () => {
    const original = globalThis.fetch;
    const originalStorage = globalThis.localStorage;
    try {
      globalThis.localStorage = { getItem: () => null, removeItem: () => {} };
      let sent;
      globalThis.fetch = async (_url, options) => {
        sent = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { id: "1" } }),
        };
      };
      await api.costingRequest("/test", "POST", {
        amount: "0.10000000",
        quantity: "100.00000000",
      });
      assert.equal(sent.amount, "0.10000000");
      assert.equal(sent.quantity, "100.00000000");
      globalThis.fetch = async () => ({
        ok: false,
        status: 422,
        json: async () => ({ message: "Choose an explicit GST basis." }),
      });
      await assert.rejects(api.costingRequest("/test"), /explicit GST basis/);
    } finally {
      globalThis.fetch = original;
      globalThis.localStorage = originalStorage;
    }
  });
} finally {
  await server.close();
}
