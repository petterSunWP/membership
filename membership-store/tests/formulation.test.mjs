import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
});
try {
  const {
    searchMaterials,
    lineInMaterialUnit,
    formulationIssue,
    prepareFormulationLines,
    materialCostIssue,
    selectLineMaterial,
  } = await server.ssrLoadModule("/src/costing/formulation.ts");
  const raw = {
    id: "1",
    name: "奥利奥 Oreo",
    code: "RAW-OREO",
    kind: "RAW",
    unit_code: "g",
    status: "ACTIVE",
    unitCost: "0.01000000",
    costError: null,
  };
  const prepared = {
    ...raw,
    id: "2",
    name: "Milk base",
    code: "PREP-MILK",
    kind: "PREPARED",
    unit_code: "ml",
  };
  const pack = {
    ...raw,
    id: "3",
    name: "Cup lid",
    code: "PACK-LID",
    kind: "PACKAGING",
    unit_code: "each",
  };
  const catalog = [
    raw,
    prepared,
    pack,
    { ...pack, id: "4", name: "Old lid", status: "ARCHIVED" },
  ];
  test("keyword search matches Chinese names, codes, case and multiple terms, excluding archives", () => {
    assert.deepEqual(
      searchMaterials(catalog, "奥利").map((m) => m.id),
      ["1"],
    );
    assert.deepEqual(
      searchMaterials(catalog, "raw-oreo").map((m) => m.id),
      ["1"],
    );
    assert.deepEqual(
      searchMaterials(catalog, "milk PREP").map((m) => m.id),
      ["2"],
    );
    assert.deepEqual(
      searchMaterials(catalog, "lid").map((m) => m.id),
      ["3"],
    );
    assert.equal(searchMaterials(catalog, "").length, 3);
    assert.equal(searchMaterials(catalog, "not found").length, 0);
  });
  test("legacy compatible quantities convert exactly to fixed material units without changing inputs", () => {
    const input = { materialId: "1", quantity: "1.25", unit: "kg" };
    const before = structuredClone(input);
    assert.deepEqual(lineInMaterialUnit(input, raw), {
      materialId: "1",
      quantity: "1250",
      unit: "g",
    });
    assert.deepEqual(input, before);
    assert.equal(
      lineInMaterialUnit(
        { materialId: "2", quantity: "0.25", unit: "l" },
        prepared,
      ).quantity,
      "250",
    );
    assert.equal(
      lineInMaterialUnit(
        { materialId: "3", quantity: "2", unit: "dozen" },
        pack,
      ).quantity,
      "24",
    );
    assert.equal(
      lineInMaterialUnit(
        { materialId: "1", quantity: "0.00000001", unit: "kg" },
        raw,
      ).quantity,
      "0.00001",
    );
    assert.throws(
      () =>
        lineInMaterialUnit(
          { materialId: "3", quantity: "1", unit: "each" },
          { ...pack, unit_code: "dozen" },
        ),
      /cannot be represented exactly/,
    );
    assert.throws(
      () =>
        lineInMaterialUnit(
          { materialId: "1", quantity: "100", unit: "ml" },
          raw,
        ),
      /not interchangeable/,
    );
  });
  test("clearing search and reselecting a legacy material preserve the displayed physical quantity", () => {
    const line = { materialId: "1", quantity: "1", unit: "kg" };
    assert.deepEqual(selectLineMaterial(line, raw, raw), {
      materialId: "1",
      quantity: "1000",
      unit: "g",
    });
    const cleared = selectLineMaterial(line, raw, null);
    assert.equal(cleared.quantity, "1000");
    assert.equal(selectLineMaterial(cleared, undefined, raw).quantity, "1000");
    assert.equal(
      selectLineMaterial({ ...line, unit: "ml" }, raw, raw).quantity,
      "",
    );
  });
  test("missing raw and packaging prices and incomplete preparations are actionable; explicit zero is valid", () => {
    assert.match(
      materialCostIssue({ ...raw, unitCost: null }),
      /Raw Ingredients/,
    );
    assert.match(
      materialCostIssue({ ...pack, unitCost: null }),
      /Packaging & Supplies/,
    );
    assert.match(
      materialCostIssue({ ...prepared, unitCost: null }),
      /measured yield/,
    );
    assert.equal(materialCostIssue({ ...pack, unitCost: "0.00000000" }), null);
  });
  test("submission validates selection and cost readiness then normalizes units without monetary calculations", () => {
    assert.match(
      formulationIssue(
        [{ materialId: "missing", quantity: "20", unit: "g" }],
        catalog,
      ),
      /Choose an active/,
    );
    assert.throws(
      () =>
        prepareFormulationLines(
          [{ materialId: "1", quantity: "20", unit: "g" }],
          [{ ...raw, unitCost: null }],
        ),
      /purchase price/,
    );
    assert.deepEqual(
      prepareFormulationLines(
        [
          { materialId: "1", quantity: "0.5", unit: "kg" },
          { materialId: "2", quantity: "300", unit: "ml" },
          { materialId: "3", quantity: "1", unit: "each" },
        ],
        catalog,
      ),
      [
        { materialId: "1", quantity: "500", unit: "g" },
        { materialId: "2", quantity: "300", unit: "ml" },
        { materialId: "3", quantity: "1", unit: "each" },
      ],
    );
  });
} finally {
  await server.close();
}
