import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import ExcelJS from "exceljs";
import { Decimal } from "../../src/costing/decimal.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { costingDb } from "../../src/costing/db.js";
import { CostingService } from "../../src/costing/service.js";
import { InventoryService } from "../../src/inventory/service.js";
import { createInventoryRouter } from "../../src/inventory/routes.js";
import { parseWorkbook } from "../../src/inventory/parsing.js";
import { createCostingRouter } from "../../src/costing/routes.js";

// All fixture rows, including test-scope access, remain in one private transaction.
// Service commits become savepoint releases; the outer transaction always rolls
// back. No real staff grant, test record or legacy-data modification persists.
const hash = (v: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
test("local HTTP and SQL inventory integration (rollback-only fixtures)", async (t) => {
  const raw = await costingDb.getConnection();
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  async function legacy() {
    const [tables]: any = await raw.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME",
    );
    const result: any = {};
    for (const { TABLE_NAME: name } of tables) {
      assert.match(name, /^[a-z_]+$/);
      const [[d]]: any = await raw.query(`SHOW CREATE TABLE \`${name}\``);
      const [r]: any = await raw.query({
        sql: `SELECT * FROM \`${name}\``,
        rowsAsArray: true,
      });
      result[name] = {
        ddl: hash(
          d["Create Table"].replace(
            /AUTO_INCREMENT=\d+/g,
            "AUTO_INCREMENT=COUNTER",
          ),
        ),
        rows: hash(r.map((x: any) => JSON.stringify(x)).sort()),
      };
    }
    return result;
  }
  const before = await legacy();
  try {
    const [[identity]]: any = await raw.query(
      "SELECT DATABASE() AS db,@@server_uuid AS uuid",
    );
    assert.equal(identity.db, "membership_dev");
    assert.equal(identity.uuid, "fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd");
    const [staff]: any = await raw.query(
      "SELECT id FROM staff_users WHERE status='ACTIVE' ORDER BY id LIMIT 1",
    );
    assert.ok(
      staff[0],
      "An existing active local staff account is needed for read-only authentication validation.",
    );
    const staffId = String(staff[0].id);
    const e = dotenv.parse(
      fs.readFileSync(new URL("../../.env", import.meta.url)),
    );
    process.env.JWT_SECRET = e.JWT_SECRET;
    const token = jwt.sign(
      {
        staffUserId: Number(staffId),
        email: "local-test@example.invalid",
        role: "ADMIN",
        tokenType: "STAFF",
      },
      e.JWT_SECRET!,
      { expiresIn: "5m" },
    );
    await raw.beginTransaction();
    const [b]: any = await raw.execute(
      "INSERT INTO costing_brands (code,name,currency_code) VALUES (?, 'Synthetic test brand','NZD')",
      [`TEST_${crypto.randomBytes(6).toString("hex")}`],
    );
    const brandId = String(b.insertId);
    const locations: string[] = [];
    for (let i = 0; i < 2; i++) {
      const [l]: any = await raw.execute(
        "INSERT INTO costing_locations (brand_id,code,name) VALUES (?,?,?)",
        [brandId, `TEST${i}`, `Test location ${i}`],
      );
      locations.push(String(l.insertId));
      await raw.execute(
        "INSERT INTO costing_staff_access (brand_id,location_id,staff_user_id,permission) VALUES (?,?,?,'ADMIN')",
        [brandId, l.insertId, staffId],
      );
    }
    const wrapped: any = {
      query: async (sql: any, ...args: any[]) =>
        typeof sql === "string" && sql.startsWith("START TRANSACTION")
          ? raw.query("SAVEPOINT costing_test_operation")
          : raw.query(sql, ...args),
      execute: raw.execute.bind(raw),
      commit: () => raw.query("RELEASE SAVEPOINT costing_test_operation"),
      rollback: async () => {
        await raw.query("ROLLBACK TO SAVEPOINT costing_test_operation");
        await raw.query("RELEASE SAVEPOINT costing_test_operation");
      },
      release: () => {},
    };
    const pool: any = { getConnection: async () => wrapped };

    const costing = new CostingService(pool),
      inventory = new InventoryService(costing);
    const scope = { brandId, locationId: locations[0]!, staffId };
    const app = express();
    app.use("/inventory", createInventoryRouter(inventory));
    app.use(express.json());
    app.use("/costing", createCostingRouter(costing));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const origin = `http://127.0.0.1:${addr.port}`;
    const root = `/brands/${brandId}/locations/${locations[0]}`;
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      status = 200,
      auth = true,
      module = "inventory",
    ) {
      const res = await fetch(`${origin}/${module}${root}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await res.json();
      assert.equal(
        res.status,
        status,
        `${method} ${path}: ${result.message ?? ""}`,
      );
      return result.data;
    }
    const cReq = (path: string, method = "GET", body?: unknown, status = 200) =>
      request(path, method, body, status, true, "costing");
    let rawItem = "",
      packItem = "",
      unknownItem = "",
      rawMaterial = "",
      importId = "";
    const source = [
      {
        code: "INV_TEA",
        name: "测试茶叶",
        kind: "RAW",
        packText: "1kg",
        amount: "10",
        packages: "2.5",
        date: "2026-11-08",
      },
      {
        code: "INV_CUP",
        name: "测试杯",
        kind: "PACKAGING",
        totalText: "298个",
        date: "2026-11-08",
      },
      {
        code: "INV_ZERO",
        name: "测试零",
        kind: "RAW",
        packText: "500g",
        packages: "0",
        date: "2026-11-08",
      },
      { code: "INV_UNKNOWN", name: "测试未知", kind: "RAW", packText: "250g" },
      { code: "INV_SKIP", name: "测试待补", kind: "RAW" },
    ];
    const previewBody = {
      rows: source,
      taxBasis: "EXCLUSIVE",
      gstRate: "0.15",
      syncPrices: true,
    };
    await t.test(
      "authentication and verified local scope protect all writes",
      async () => {
        await request("/items", "GET", undefined, 401, false);
        await assert.rejects(() =>
          inventory.list({ ...scope, locationId: "999999999999" }),
        );
      },
    );
    await t.test(
      "preview is explicit and does not create material, stock or prices",
      async () => {
        const p = await request("/imports/preview", "POST", previewBody);
        importId = p.id;
        assert.equal(p.summary.ready, 3);
        assert.equal(p.summary.skipped, 2);
        assert.equal(p.summary.stockCounts, 3);
        assert.equal(p.summary.prices, 1);
        assert.equal((await request("/items")).length, 0);
        assert.equal((await cReq("/materials")).length, 0);
        await request(
          "/imports/preview",
          "POST",
          { ...previewBody, taxBasis: undefined },
          422,
        );
      },
    );
    await t.test(
      "confirm atomically shares materials, initializes stock and syncs exclusive cost",
      async () => {
        const result = await request(
          `/imports/${importId}/confirm`,
          "POST",
          {},
        );
        assert.equal(result.itemsCreated, 3);
        assert.equal(result.stockCounts, 3);
        assert.equal(result.prices, 1);
        await request("/items", "POST", {
          code: "INV_UNKNOWN",
          name: "测试未知",
          kind: "RAW",
          baseUnit: "g",
          packText: "250g",
        });
        const items = await request("/items");
        const tea = items.find((i: any) => i.code === "INV_TEA");
        rawItem = tea.id;
        rawMaterial = tea.material_id;
        packItem = items.find((i: any) => i.code === "INV_CUP").id;
        unknownItem = items.find((i: any) => i.code === "INV_UNKNOWN").id;
        assert.equal(tea.quantity, "2500.00000000");
        assert.equal(
          items.find((i: any) => i.code === "INV_ZERO").quantity,
          "0.00000000",
        );
        assert.equal(
          items.find((i: any) => i.id === packItem).quantity,
          "298.00000000",
        );
        assert.equal(
          items.find((i: any) => i.id === unknownItem).quantity,
          null,
        );
        const d = await cReq(`/materials/${rawMaterial}`);
        assert.equal(d.inventorySpec.quantity, "1000.00000000");
        assert.equal(d.prices[0].tax_basis, "EXCLUSIVE");
        assert.equal(d.prices[0].amount, "10.00000000");
        assert.equal(d.material.unit_code, "g");
        assert.equal(
          (await cReq("/materials")).find((m: any) => m.id === rawMaterial)
            .unitCost,
          "0.01000000",
        );
        assert.equal(
          (await request(`/imports/${importId}/confirm`, "POST", {})).duplicate,
          true,
        );
        await assert.rejects(() =>
          inventory.confirm({ ...scope, locationId: locations[1]! }, importId),
        );
      },
    );
    async function move(
      item: string,
      action: string,
      quantity: string,
      unit = "g",
      extra = {},
    ) {
      const d = await request(`/items/${item}`);
      return request(`/items/${item}/movements`, "POST", {
        action,
        quantity,
        unit,
        date: "2026-11-09",
        reason: "Synthetic operation",
        requestId: crypto.randomUUID(),
        version: d.balance?.row_version ?? null,
        ...extra,
      });
    }
    await t.test(
      "receipt, issue, waste, counts, units and idempotency preserve exact balances",
      async () => {
        const d = await request(`/items/${rawItem}`);
        const body = {
          action: "RECEIPT",
          quantity: "0.25",
          unit: "kg",
          date: "2026-11-09",
          reason: "receipt",
          requestId: crypto.randomUUID(),
          version: d.balance.row_version,
        };
        const r = await request(`/items/${rawItem}/movements`, "POST", body);
        assert.equal(r.quantity_after, "2750.00000000");
        assert.equal(
          (await request(`/items/${rawItem}/movements`, "POST", body))
            .duplicate,
          true,
        );
        await request(
          `/items/${rawItem}/movements`,
          "POST",
          { ...body, quantity: "1" },
          409,
        );
        await request(
          `/items/${rawItem}/movements`,
          "POST",
          { ...body, requestId: crypto.randomUUID() },
          409,
        );
        assert.equal(
          (await move(rawItem, "ISSUE", "100")).quantity_after,
          "2650.00000000",
        );
        assert.equal(
          (await move(rawItem, "WASTE", "50")).quantity_after,
          "2600.00000000",
        );
        assert.equal(
          (await move(rawItem, "COUNT", "2", "kg")).quantity_after,
          "2000.00000000",
        );
        const spec = (await request(`/items/${rawItem}`)).spec;
        const b = (await request(`/items/${rawItem}`)).balance;
        const pack = await request(`/items/${rawItem}/movements`, "POST", {
          action: "RECEIPT",
          packCount: "0.5",
          specId: spec.id,
          date: "2026-11-09",
          reason: "half bag",
          requestId: crypto.randomUUID(),
          version: b.row_version,
        });
        assert.equal(pack.quantity_after, "2500.00000000");
        const zero = (await request("/items")).find(
          (i: any) => i.id === unknownItem,
        );
        assert.equal(zero.stock_status, "UNKNOWN");
        await assert.rejects(() =>
          inventory.move(scope, unknownItem, {
            action: "RECEIPT",
            quantity: "1",
            unit: "g",
            reason: "unknown",
            date: "2026-11-09",
            requestId: crypto.randomUUID(),
            version: null,
          }),
        );
        const opened = await move(unknownItem, "COUNT", "0");
        assert.equal(opened.action, "OPENING");
        assert.equal(opened.quantity_before, null);
      },
    );
    await t.test(
      "rejects negative, fractional packaging, cross-dimension and stale-date operations",
      async () => {
        for (const input of [
          { action: "ISSUE", quantity: "999999", unit: "g" },
          { action: "RECEIPT", quantity: "1", unit: "ml" },
          { action: "COUNT", quantity: "1", unit: "g", date: "2026-11-08" },
        ]) {
          const d = await request(`/items/${rawItem}`);
          await assert.rejects(() =>
            inventory.move(scope, rawItem, {
              date: "2026-11-09",
              reason: "invalid",
              requestId: crypto.randomUUID(),
              version: d.balance.row_version,
              ...input,
            }),
          );
        }
        await assert.rejects(() => move(packItem, "ISSUE", "0.5", "each"));
      },
    );
    await t.test(
      "compensating reversals retain history and reject a second reversal",
      async () => {
        const r = await move(rawItem, "ISSUE", "100");
        const d = await request(`/items/${rawItem}`);
        const body = {
          action: "REVERSAL",
          reversalId: r.id,
          date: "2026-11-09",
          reason: "undo issue",
          requestId: crypto.randomUUID(),
          version: d.balance.row_version,
        };
        const reverse = await request(
          `/items/${rawItem}/movements`,
          "POST",
          body,
        );
        assert.equal(reverse.reversal_of, r.id);
        assert.equal(reverse.quantity_after, "2500.00000000");
        const next = await request(`/items/${rawItem}`);
        await request(
          `/items/${rawItem}/movements`,
          "POST",
          {
            ...body,
            requestId: crypto.randomUUID(),
            version: next.balance.row_version,
          },
          409,
        );
        assert.ok(next.movements.some((m: any) => m.id === r.id));
      },
    );
    await t.test(
      "completed content is idempotent after stock changes; stale previews cannot overwrite stock",
      async () => {
        assert.equal(
          (await request("/imports/preview", "POST", previewBody)).completed,
          true,
        );
        assert.equal(
          (await request(`/items/${rawItem}`)).balance.quantity,
          "2500.00000000",
        );
        const rows = [{ ...source[0], packages: "4", date: "2026-11-09" }];
        const p = await request("/imports/preview", "POST", {
          ...previewBody,
          rows,
        });
        await move(rawItem, "RECEIPT", "1");
        await request(`/imports/${p.id}/confirm`, "POST", {}, 409);
        assert.equal(
          (await request(`/items/${rawItem}`)).balance.quantity,
          "2501.00000000",
        );
      },
    );
    await t.test(
      "immutable specs drive safe prices and preserve previous price denominator",
      async () => {
        let d = await request(`/items/${rawItem}`);
        const oldSpec = d.spec.id;
        await request(`/items/${rawItem}`, "PATCH", {
          version: d.item.row_version,
          packText: "2kg",
          minimumQuantity: "3000",
        });
        d = await request(`/items/${rawItem}`);
        assert.notEqual(d.spec.id, oldSpec);
        assert.equal(d.specs.length, 2);
        assert.equal(d.balance.quantity, "2501.00000000");
        const priceDetail = await cReq(`/materials/${rawMaterial}`);
        await cReq(
          `/materials/${rawMaterial}/prices`,
          "POST",
          {
            amount: "20",
            quantity: "1",
            unit: "g",
            inventorySpecId: oldSpec,
            taxBasis: "EXCLUSIVE",
            gstRate: "0",
            version: priceDetail.priceHead.row_version,
          },
          409,
        );
        await cReq(`/materials/${rawMaterial}/prices`, "POST", {
          amount: "20",
          quantity: "1",
          unit: "g",
          inventorySpecId: d.spec.id,
          taxBasis: "EXCLUSIVE",
          gstRate: "0",
          version: priceDetail.priceHead.row_version,
        });
        const after = await cReq(`/materials/${rawMaterial}`);
        assert.equal(after.prices[0].usable_quantity, "2000.00000000");
        assert.equal(after.prices[0].gst_rate, "0.00000000");
        assert.equal(after.prices[1].usable_quantity, "1000.00000000");
        assert.equal(
          (await request("/items")).find((i: any) => i.id === rawItem)
            .stock_status,
          "LOW",
        );
        await request(
          `/items/${rawItem}/archive`,
          "POST",
          { version: d.item.row_version },
          409,
        );
        await cReq(
          `/materials/${rawMaterial}/archive`,
          "POST",
          { version: after.material.row_version },
          409,
        );
      },
    );
    await t.test(
      "same-name imports require explicit association and never assume kg equals ml",
      async () => {
        const m = await cReq("/materials", "POST", {
          code: "EXISTING_LIQUID",
          name: "同名液体",
          kind: "RAW",
          unit: "ml",
        });
        const body = {
          ...previewBody,
          rows: [
            {
              code: "NEW_LIQUID",
              name: "同名液体",
              kind: "RAW",
              packText: "1kg",
              packages: "1",
              amount: "5",
              date: "2026-11-08",
            },
          ],
        };
        const ambiguous = await request("/imports/preview", "POST", body);
        assert.equal(ambiguous.plans[0].status, "ERROR");
        assert.equal(ambiguous.plans[0].candidates[0].id, m.id);
        const resolved = await request("/imports/preview", "POST", {
          ...body,
          mappings: { NEW_LIQUID: m.id },
        });
        assert.equal(resolved.plans[0].status, "ERROR");
        await request(`/imports/${resolved.id}/confirm`, "POST", {}, 409);
        const stockOnly = await request("/imports/preview", "POST", {
          ...body,
          mappings: { NEW_LIQUID: m.id },
          syncPrices: false,
        });
        const r = await request(`/imports/${stockOnly.id}/confirm`, "POST", {});
        assert.equal(r.pricesDeferred, 0);
        assert.equal((await cReq(`/materials/${m.id}`)).prices.length, 0);
      },
    );
    await t.test(
      "active preparation dependencies block archiving even at zero stock",
      async () => {
        const item = (await request("/items")).find(
          (i: any) => i.code === "INV_ZERO",
        );
        const spec = (await request(`/items/${item.id}`)).spec;
        await cReq(`/materials/${item.material_id}/prices`, "POST", {
          amount: "1",
          inventorySpecId: spec.id,
          taxBasis: "EXCLUSIVE",
          gstRate: "0",
        });
        const prep = await cReq("/materials", "POST", {
          code: "PREPARED_TEST",
          name: "Prepared test",
          kind: "PREPARED",
          unit: "ml",
        });
        await cReq(`/materials/${prep.id}/preparation`, "POST", {
          lines: [{ materialId: item.material_id, quantity: "1", unit: "g" }],
          yieldQuantity: "10",
          yieldUnit: "ml",
        });
        await request(
          `/items/${item.id}/archive`,
          "POST",
          { version: item.row_version },
          409,
        );
        await cReq(`/materials/${prep.id}/archive`, "POST", { version: 1 });
        await request(`/items/${item.id}/archive`, "POST", {
          version: item.row_version,
        });
        await cReq(`/materials/${item.material_id}/archive`, "POST", {
          version: 1,
        });
        assert.equal(
          (await request(`/items/${item.id}`)).item.status,
          "ARCHIVED",
        );
      },
    );
    await t.test(
      "current template export and packaging price-only reimport preserve all stock",
      async () => {
        const beforeItems = await request("/items");
        const beforeMoves = await request("/movements");
        const res = await fetch(`${origin}/inventory${root}/imports/template`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res.status, 200);
        assert.match(
          res.headers.get("content-disposition")!,
          /inventory-price-update.xlsx/,
        );
        assert.equal(res.headers.get("cache-control"), "no-store");
        const w = new ExcelJS.Workbook();
        await w.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
        const sheet = w.getWorksheet("Inventory")!;
        let edited = false;
        sheet.eachRow((r, i) => {
          if (i > 1) {
            assert.ok([null, ""].includes(r.getCell(6).value as any));
            assert.ok([null, ""].includes(r.getCell(7).value as any));
            assert.ok([null, ""].includes(r.getCell(8).value as any));
            if (r.getCell(1).value === "INV_CUP") {
              r.getCell(4).value = "100each";
              r.getCell(5).value = "12.50";
              edited = true;
            }
          }
        });
        assert.ok(edited);
        const parsed = await parseWorkbook(
          Buffer.from(await w.xlsx.writeBuffer()),
        );
        const cup = parsed.find((r) => r.code === "INV_CUP")!;
        const p = await request("/imports/preview", "POST", {
          rows: [cup],
          taxBasis: "EXCLUSIVE",
          gstRate: "0.15",
          syncPrices: true,
        });
        assert.equal(p.summary.stockCounts, 0);
        assert.equal(p.summary.prices, 1);
        await request(`/imports/${p.id}/confirm`, "POST", {});
        const afterItems = await request("/items");
        assert.deepEqual(
          afterItems.map((i: any) => [i.id, i.quantity, i.balance_version]),
          beforeItems.map((i: any) => [i.id, i.quantity, i.balance_version]),
        );
        assert.equal((await request("/movements")).length, beforeMoves.length);
        const pack = afterItems.find((i: any) => i.id === packItem);
        const cost = await cReq(`/materials/${pack.material_id}`);
        assert.equal(cost.prices[0].amount, "12.50000000");
        assert.equal(cost.prices[0].usable_quantity, "100.00000000");
        assert.equal(
          (await cReq("/materials")).find((m: any) => m.id === pack.material_id)
            .unitCost,
          "0.12500000",
        );
      },
    );
    await t.test(
      "binary Excel upload route validates authentication and file format",
      async (caseContext) => {
        const file = new URL(
          "../../../outputs/inventory-reviewed-20261109/库存登记_核对版.xlsx",
          import.meta.url,
        );
        if (!fs.existsSync(file)) {
          caseContext.skip("Reviewed local workbook is unavailable.");
          return;
        }
        const res = await fetch(`${origin}/inventory${root}/imports/parse`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: fs.readFileSync(file),
        });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).data.length, 45);
        await request("/imports/parse", "POST", {}, 422);
      },
    );

    const dualRaw = {
      code: "DUAL_RAW",
      name: "Dual raw",
      kind: "RAW",
      packText: "0.5kg",
    };
    const dualPack = {
      code: "DUAL_PACK",
      name: "Dual pack",
      kind: "PACKAGING",
      packText: "100each",
    };
    const settings = {
      taxBasis: "EXCLUSIVE",
      gstRate: "0.15",
      syncPrices: true,
    };
    const previewDual = (rows: any[], extra: any = {}) =>
      request("/imports/preview", "POST", { ...settings, rows, ...extra });
    const postDual = (p: any) =>
      request(`/imports/${p.id}/confirm`, "POST", {
        previewToken: p.previewToken,
      });
    const dualItems = async () => {
      const items = await request("/items");
      return {
        raw: items.find((i: any) => i.code === "DUAL_RAW"),
        pack: items.find((i: any) => i.code === "DUAL_PACK"),
      };
    };
    await t.test(
      "stocktake defaults, explicit zero, omitted items and independent blank fields",
      async () => {
        const p = await previewDual([
          { ...dualRaw, packages: "2", date: "2026-11-10" },
          { ...dualPack, totalText: "12each", date: "2026-11-10" },
        ]);
        assert.equal(p.mode, "STOCKTAKE");
        assert.equal(p.plans[0].currentStock, null);
        assert.equal(p.plans[0].resultingStock, "1000.00000000");
        await postDual(p);
        const q = await previewDual([
          { ...dualRaw, packages: "0", date: "2026-11-10" },
          {
            code: "NO_ACTION",
            name: "No action",
            kind: "RAW",
            packText: "1kg",
          },
        ]);
        assert.equal(q.plans[0].currentStock, "1000.00000000");
        assert.equal(q.plans[0].resultingStock, "0.00000000");
        assert.equal(q.plans[1].status, "SKIP");
        await postDual(q);
        const i = await dualItems();
        assert.equal(i.raw.quantity, "0.00000000");
        assert.equal(i.pack.quantity, "12.00000000");
        assert.ok(
          !(await request("/items")).some((i: any) => i.code === "NO_ACTION"),
        );
      },
    );
    await t.test(
      "receipt adds exact pack quantities and total counts, recording operator, date and batch",
      async () => {
        const p = await previewDual(
          [
            { ...dualRaw, packages: "1.5", date: "2026-11-10" },
            { ...dualPack, totalText: "8each", date: "2026-11-10" },
          ],
          { mode: "RECEIPT", batchId: "DELIVERY-001" },
        );
        assert.equal(p.plans[0].currentStock, "0.00000000");
        assert.equal(p.plans[0].resultingStock, "750.00000000");
        assert.equal(p.plans[1].resultingStock, "20.00000000");
        const r = await postDual(p);
        assert.equal(r.stockCounts, 2);
        assert.equal(r.batchId, "DELIVERY-001");
        const i = await dualItems();
        assert.equal(i.raw.quantity, "750.00000000");
        assert.equal(i.pack.quantity, "20.00000000");
        const d = await request(`/items/${i.raw.id}`);
        assert.equal(d.movements[0].action, "RECEIPT");
        assert.equal(d.movements[0].observed_date, "2026-11-10");
        assert.equal(String(d.movements[0].created_by), staffId);
        assert.match(d.movements[0].reason, /DELIVERY-001/);
        assert.match(d.movements[0].request_id, new RegExp(`import:${p.id}:`));
        assert.equal((await postDual(p)).duplicate, true);
        const same = await previewDual(
          [
            { ...dualPack, totalText: "8each", date: "2026-11-10" },
            { ...dualRaw, packages: "1.5", date: "2026-11-10" },
          ],
          { mode: "RECEIPT", batchId: "delivery-001" },
        );
        assert.equal(same.completed, true);
        await request(
          "/imports/preview",
          "POST",
          {
            ...settings,
            rows: [{ ...dualRaw, packages: "1.5", date: "2026-11-10" }],
            mode: "RECEIPT",
            batchId: "DELIVERY-001",
            syncPrices: false,
          },
          409,
        );
        assert.equal((await dualItems()).raw.quantity, "750.00000000");
      },
    );
    await t.test(
      "both modes support price-only updates, GST and immutable price history",
      async () => {
        let p = await previewDual([{ ...dualPack, amount: "11.50" }], {
          mode: "RECEIPT",
          batchId: "PRICE-ONLY-001",
          taxBasis: "INCLUSIVE",
        });
        assert.equal(p.summary.stockCounts, 0);
        assert.equal(p.plans[0].changesPrice, true);
        assert.equal(p.plans[0].resultingStock, "20.00000000");
        await postDual(p);
        let i = await dualItems();
        assert.equal(i.pack.quantity, "20.00000000");
        let d = await cReq(`/materials/${i.pack.material_id}`);
        assert.equal(d.prices[0].tax_basis, "INCLUSIVE");
        const oldId = d.prices[0].id;
        assert.equal(
          (await cReq("/materials")).find(
            (m: any) => m.id === i.pack.material_id,
          ).unitCost,
          "0.10000000",
        );
        p = await previewDual([{ ...dualPack, amount: "12" }], {
          gstRate: "0",
        });
        assert.equal(p.plans[0].currentPrice.amount, "11.50000000");
        assert.equal(p.plans[0].nextPrice.amount, "12");
        await postDual(p);
        d = await cReq(`/materials/${i.pack.material_id}`);
        assert.equal(d.prices.length, 2);
        assert.equal(d.prices[1].id, oldId);
        assert.equal(d.prices[0].gst_rate, "0.00000000");
        assert.equal((await dualItems()).pack.quantity, "20.00000000");
        const disabled = await previewDual([{ ...dualPack, amount: "99" }], {
          syncPrices: false,
        });
        assert.equal(disabled.plans[0].status, "SKIP");
        assert.equal(disabled.summary.ready, 0);
      },
    );
    await t.test(
      "receipt quantity and price updates are independent, including zero no-op receipts",
      async () => {
        const p = await previewDual(
          [
            { ...dualRaw, packages: "1", amount: "5", date: "2026-11-10" },
            { ...dualPack, totalText: "0each", date: "2026-11-10" },
          ],
          { mode: "RECEIPT", batchId: "DELIVERY-002" },
        );
        assert.equal(p.summary.stockCounts, 1);
        assert.equal(p.plans[1].status, "SKIP");
        await postDual(p);
        let i = await dualItems();
        assert.equal(i.raw.quantity, "1250.00000000");
        assert.equal(i.pack.quantity, "20.00000000");
        const d = await cReq(`/materials/${i.raw.material_id}`);
        assert.equal(d.prices[0].amount, "5.00000000");
        const stockOnly = await previewDual(
          [{ ...dualRaw, packages: "1", amount: "123", date: "2026-11-10" }],
          { mode: "RECEIPT", batchId: "DELIVERY-003", syncPrices: false },
        );
        await postDual(stockOnly);
        i = await dualItems();
        assert.equal(i.raw.quantity, "1750.00000000");
        assert.equal(
          (await cReq(`/materials/${i.raw.material_id}`)).prices.length,
          1,
        );
      },
    );
    await t.test(
      "invalid batches block all posting; explicit exclusions must be re-previewed",
      async () => {
        const before = (await dualItems()).raw.quantity;
        for (const bad of [
          { ...dualPack, totalText: "1ml", date: "2026-11-10" },
          { ...dualPack, totalText: "bad", date: "2026-11-10" },
          { ...dualPack, amount: "-1" },
          { ...dualPack, totalText: "1.5each", date: "2026-11-10" },
          {
            code: "MISSING_OPENING",
            name: "Unknown item",
            kind: "RAW",
            packText: "1g",
            packages: "1",
            date: "2026-11-10",
          },
        ]) {
          const p = await previewDual(
            [{ ...dualRaw, packages: "1", date: "2026-11-10" }, bad],
            { mode: "RECEIPT", batchId: crypto.randomUUID() },
          );
          assert.ok(p.summary.errors);
          await request(
            `/imports/${p.id}/confirm`,
            "POST",
            { previewToken: p.previewToken },
            409,
          );
          assert.equal((await dualItems()).raw.quantity, before);
        }
        await request(
          "/imports/preview",
          "POST",
          {
            ...settings,
            rows: [{ ...dualRaw }, { ...dualRaw }],
            mode: "RECEIPT",
            batchId: "DUPLICATE-ROWS",
          },
          422,
        );
        await request(
          "/imports/preview",
          "POST",
          {
            ...settings,
            rows: [{ ...dualRaw, packages: "1", date: "2026-11-10" }],
            mode: "RECEIPT",
          },
          422,
        );
        const body = {
          ...settings,
          mode: "RECEIPT",
          batchId: "EXCLUDED-001",
          rows: [
            { ...dualRaw, packages: "1", date: "2026-11-10" },
            { ...dualPack, amount: "-1" },
          ],
        };
        const p = await request("/imports/preview", "POST", body);
        const revised = await request("/imports/preview", "POST", {
          ...body,
          excludedCodes: ["DUAL_PACK"],
        });
        assert.equal(p.id, revised.id);
        await request(
          `/imports/${p.id}/confirm`,
          "POST",
          { previewToken: p.previewToken },
          409,
        );
        await postDual(revised);
        assert.equal(
          (await dualItems()).raw.quantity,
          Decimal.of(before).add(Decimal.of("500")).toFixed(8),
        );
      },
    );
    await t.test(
      "receipt previews reject stale stock and can be refreshed without changing batch identity",
      async () => {
        const body = { mode: "RECEIPT", batchId: "STALE-001" };
        const row = { ...dualPack, totalText: "2each", date: "2026-11-10" };
        const p = await previewDual([row], body);
        const i = await dualItems();
        const d = await request(`/items/${i.pack.id}`);
        await request(`/items/${i.pack.id}/movements`, "POST", {
          action: "RECEIPT",
          quantity: "1",
          unit: "each",
          date: "2026-11-10",
          reason: "Synthetic intervening receipt",
          requestId: crypto.randomUUID(),
          version: d.balance.row_version,
        });
        await request(
          `/imports/${p.id}/confirm`,
          "POST",
          { previewToken: p.previewToken },
          409,
        );
        const revised = await previewDual([row], body);
        assert.equal(revised.id, p.id);
        assert.notEqual(revised.previewToken, p.previewToken);
        await postDual(revised);
        assert.equal((await dualItems()).pack.quantity, "23.00000000");
      },
    );
    await t.test(
      "a mid-post failure rolls back every stock, price and ledger write; retry posts once",
      async () => {
        const p = await previewDual(
          [
            { ...dualRaw, packages: "1", amount: "27", date: "2026-11-10" },
            { ...dualPack, totalText: "1each", date: "2026-11-10" },
          ],
          { mode: "RECEIPT", batchId: "ROLLBACK-001" },
        );
        const beforeItems = await request("/items");
        const beforeHistory = await request("/movements");
        const i = await dualItems();
        const beforePrices = (await cReq(`/materials/${i.raw.material_id}`))
          .prices;
        const execute = wrapped.execute;
        let writes = 0;
        wrapped.execute = async (sql: any, ...args: any[]) => {
          if (
            typeof sql === "string" &&
            sql.startsWith("INSERT INTO inventory_movements") &&
            ++writes === 2
          )
            throw new Error("Synthetic mid-batch failure");
          return execute(sql, ...args);
        };
        try {
          await request(
            `/imports/${p.id}/confirm`,
            "POST",
            { previewToken: p.previewToken },
            500,
          );
        } finally {
          wrapped.execute = execute;
        }
        assert.deepEqual(await request("/items"), beforeItems);
        assert.deepEqual(await request("/movements"), beforeHistory);
        assert.deepEqual(
          (await cReq(`/materials/${i.raw.material_id}`)).prices,
          beforePrices,
        );
        const [[pending]]: any = await raw.query(
          "SELECT status FROM inventory_imports WHERE id=?",
          [p.id],
        );
        assert.equal(pending.status, "PREVIEW");
        await postDual(p);
        assert.equal((await postDual(p)).duplicate, true);
        assert.equal(
          (await request("/movements")).length,
          beforeHistory.length + 2,
        );
      },
    );
    await t.test(
      "scope ownership, linked-code conflicts and viewer permissions are validated",
      async () => {
        await assert.rejects(() =>
          inventory.detail({ ...scope, locationId: locations[1]! }, rawItem),
        );
        await request(
          "/items",
          "POST",
          { materialId: rawMaterial, code: "EXISTING_LIQUID", baseUnit: "g" },
          409,
        );
        await raw.execute(
          "UPDATE costing_staff_access SET permission='VIEWER' WHERE brand_id=? AND location_id=? AND staff_user_id=?",
          [brandId, locations[0], staffId],
        );
        assert.ok((await request("/items")).length);
        await request("/imports/preview", "POST", previewBody, 403);
        await request(`/items/${rawItem}/movements`, "POST", {}, 403);
      },
    );
    await t.test(
      "reviewed workbook parses read-only with 45 catalog rows and 41 measured quantities",
      async (caseContext) => {
        const file = new URL(
          "../../../outputs/inventory-reviewed-20261109/库存登记_核对版.xlsx",
          import.meta.url,
        );
        if (!fs.existsSync(file)) {
          caseContext.skip(
            "Reviewed private workbook not present; skipped real-file check.",
          );
          return;
        }
        const rows = await parseWorkbook(fs.readFileSync(file));
        assert.equal(rows.length, 45);
        assert.equal(
          rows.filter((r) => r.packages !== "" || r.totalText !== "").length,
          41,
        );
        assert.equal(rows.filter((r) => r.kind === "PACKAGING").length, 10);
        assert.equal(rows.filter((r) => r.amount !== "").length, 26);
      },
    );
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    let after;
    try {
      await raw.rollback();
      after = await legacy();
    } finally {
      raw.release();
      await costingDb.end();
    }
    assert.deepEqual(
      after,
      before,
      "Legacy schemas and all row values must remain unchanged.",
    );
  }
});
