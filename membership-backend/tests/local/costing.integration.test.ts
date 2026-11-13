import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { costingDb } from "../../src/costing/db.js";
import { CostingService } from "../../src/costing/service.js";
import { createCostingRouter } from "../../src/costing/routes.js";

// All fixture rows, including test-scope access, remain in one private transaction.
// Service commits become savepoint releases; the outer transaction always rolls
// back. No real staff grant, test record or legacy-data modification persists.
const hash = (v: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
test("local HTTP and SQL costing integration (rollback-only fixtures)", async (t) => {
  const raw = await costingDb.getConnection();
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  async function legacy() {
    const [tables]: any = await raw.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,8)<>'costing_' ORDER BY TABLE_NAME",
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
        ddl: hash(d["Create Table"]),
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
    const app = express();
    app.use(express.json());
    app.use("/costing", createCostingRouter(new CostingService(pool)));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/costing/brands/${brandId}/locations/${locations[0]}`;
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      status = 200,
      auth = true,
    ) {
      const res = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await res.json();
      assert.equal(
        res.status,
        status,
        `${method} ${path}: ${value.message ?? "Unexpected response"}`,
      );
      return value.data;
    }
    const material = async (code: string, kind = "RAW", unit = "g") =>
      (await request("/materials", "POST", { code, name: code, kind, unit }))
        .id as string;
    let leaves = "",
      tea = "",
      cup = "",
      recipe = "",
      variant = "",
      lineId = "",
      revision = "",
      group = "",
      option = "",
      attachment = "";
    await t.test("authentication and scope isolation", async () => {
      await request("/materials", "GET", undefined, 401, false);
      const absent = await fetch(
        `http://127.0.0.1:${address.port}/costing/brands/999999999/locations/1/materials`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(absent.status, 404);
    });
    await t.test(
      "raw ingredients, packaging, price history and decimal validation",
      async () => {
        leaves = await material("Tea leaves");
        cup = await material("Cup", "PACKAGING", "each");
        tea = await material("Prepared tea", "PREPARED", "ml");
        await request(`/materials/${leaves}/prices`, "POST", {
          amount: "12",
          quantity: "100",
          unit: "g",
          taxBasis: "EXCLUSIVE",
          gstRate: "0.15",
        });
        await request(`/materials/${cup}/prices`, "POST", {
          amount: "11.50",
          quantity: "100",
          unit: "each",
          taxBasis: "INCLUSIVE",
          gstRate: "0.15",
        });
        await request(
          `/materials/${leaves}/prices`,
          "POST",
          {
            amount: "1",
            quantity: "0",
            unit: "g",
            taxBasis: "EXCLUSIVE",
            gstRate: "0.15",
            version: 1,
          },
          422,
        );
        await request(
          `/materials/${leaves}/prices`,
          "POST",
          {
            amount: "1",
            quantity: "10",
            unit: "ml",
            taxBasis: "EXCLUSIVE",
            gstRate: "0.15",
            version: 1,
          },
          422,
        );
        await request(
          `/materials/${tea}/prices`,
          "POST",
          {
            amount: "1",
            quantity: "100",
            unit: "ml",
            taxBasis: "EXCLUSIVE",
            gstRate: "0.15",
          },
          422,
        );
      },
    );
    await t.test(
      "measured gram-to-ml preparation and cycle rejection",
      async () => {
        await request(`/materials/${tea}/preparation`, "POST", {
          lines: [{ materialId: leaves, quantity: "100", unit: "g" }],
          yieldQuantity: "2400",
          yieldUnit: "ml",
        });
        const detail = await request(`/materials/${tea}`);
        revision = detail.head.preparation_revision_id;
        await request(
          `/materials/${tea}/preparation`,
          "POST",
          {
            version: detail.head.row_version,
            lines: [{ materialId: tea, quantity: "1", unit: "ml" }],
            yieldQuantity: "100",
            yieldUnit: "ml",
          },
          422,
        );
        await request(`/materials/${tea}/yields`, "POST", {
          revisionId: revision,
          quantity: "2000",
          unit: "ml",
          select: false,
        });
        const after = await request(`/materials/${tea}`);
        assert.equal(after.head.row_version, 1);
        assert.equal(after.measurements.length, 2);
      },
    );
    await t.test(
      "size-specific recipe, GST-exclusive profit and packaging",
      async () => {
        const size = (
          await request("/sizes", "POST", { code: "M", label: "Medium" })
        ).id;
        recipe = (
          await request("/recipes", "POST", { name: "Synthetic milk tea" })
        ).id;
        variant = (
          await request(`/recipes/${recipe}/variants`, "POST", {
            sizeId: size,
            priceSource: "OVERRIDE",
            priceOverride: "11.50",
            taxBasis: "INCLUSIVE",
            gstRate: "0.15",
          })
        ).id;
        await request(`/variants/${variant}/revisions`, "POST", {
          lines: [
            { materialId: tea, quantity: "400", unit: "ml" },
            { materialId: cup, quantity: "1", unit: "each" },
          ],
        });
        const cost = await request(`/variants/${variant}/cost`);
        assert.equal(cost.cost, "2.10000000");
        assert.equal(cost.revenue, "10.00000000");
        assert.equal(cost.marginPercent, "79.0000");
        const d = await request(`/recipes/${recipe}`);
        lineId = d.variants[0].lines[0].id;
      },
    );
    await t.test(
      "automatic propagation, immutable prices and stale-write rollback",
      async () => {
        await request(`/materials/${leaves}/prices`, "POST", {
          amount: "24",
          quantity: "100",
          unit: "g",
          taxBasis: "EXCLUSIVE",
          gstRate: "0.15",
          version: 1,
        });
        assert.equal(
          (await request(`/variants/${variant}/cost`)).cost,
          "4.10000000",
        );
        await request(
          `/materials/${leaves}/prices`,
          "POST",
          {
            amount: "99",
            quantity: "100",
            unit: "g",
            taxBasis: "EXCLUSIVE",
            gstRate: "0.15",
            version: 1,
          },
          409,
        );
        assert.equal((await request(`/materials/${leaves}`)).prices.length, 2);
        await request(
          `/materials/${leaves}/archive`,
          "POST",
          { version: 1 },
          409,
        );
        await request(`/materials/${cup}/archive`, "POST", { version: 1 }, 409);
      },
    );
    await t.test(
      "cross-location logical ownership is rejected without database constraints",
      async () => {
        const [foreign]: any = await raw.execute(
          "INSERT INTO costing_materials (brand_id,location_id,code,name,kind,unit_code) VALUES (?,?,?,'Other location ingredient','RAW','g')",
          [brandId, locations[1], "FOREIGN"],
        );
        await request(`/materials/${foreign.insertId}`, "GET", undefined, 404);
        await request(
          `/variants/${variant}/revisions`,
          "POST",
          {
            version: 1,
            lines: [
              {
                materialId: String(foreign.insertId),
                quantity: "1",
                unit: "g",
              },
            ],
          },
          404,
        );
        const otherPrep = await material("Other prepared", "PREPARED", "ml");
        await request(
          `/materials/${otherPrep}/yields`,
          "POST",
          { revisionId: revision, quantity: "100", unit: "ml" },
          422,
        );
      },
    );
    await t.test(
      "toppings, selection validation, option effects and archive protection",
      async () => {
        group = (
          await request("/option-groups", "POST", {
            name: "Toppings",
            min: 0,
            max: 1,
          })
        ).id;
        option = (
          await request("/options", "POST", {
            groupId: group,
            name: "Extra tea",
            kind: "TOPPING",
          })
        ).id;
        attachment = (
          await request(`/variants/${variant}/options`, "POST", {
            optionId: option,
            surcharge: "1.15",
            taxBasis: "INCLUSIVE",
            gstRate: "0.15",
            maxPortions: 2,
            effects: [
              {
                operation: "ADD",
                materialId: tea,
                quantity: "100",
                unit: "ml",
              },
            ],
          })
        ).id;
        const quote = await request(
          `/variants/${variant}/cost-preview`,
          "POST",
          { selections: [{ attachmentId: attachment, portions: 2 }] },
        );
        assert.equal(quote.cost, "6.10000000");
        assert.equal(quote.revenue, "12.00000000");
        await request(
          `/variants/${variant}/cost-preview`,
          "POST",
          { selections: [{ attachmentId: attachment, portions: 3 }] },
          422,
        );
        await request(
          `/variants/${variant}/cost-preview`,
          "POST",
          {
            selections: [
              { attachmentId: attachment, portions: 1 },
              { attachmentId: attachment, portions: 1 },
            ],
          },
          422,
        );
        await request(`/materials/${tea}/archive`, "POST", { version: 1 }, 409);
        await request(
          `/variants/${variant}/revisions`,
          "POST",
          {
            version: 1,
            lines: [{ materialId: cup, quantity: "1", unit: "each" }],
          },
          409,
        );
        await request(`/variants/${variant}/options/${attachment}`, "DELETE");
      },
    );
    await t.test(
      "removal customisation, effect ownership, yield selection and audit",
      async () => {
        const o = (
          await request("/options", "POST", {
            groupId: group,
            name: "Less tea",
            kind: "OTHER",
          })
        ).id;
        const a = (
          await request(`/variants/${variant}/options`, "POST", {
            optionId: o,
            surcharge: "0",
            taxBasis: "EXCLUSIVE",
            gstRate: "0",
            effects: [
              {
                operation: "SET_QUANTITY",
                targetLineId: lineId,
                quantity: "200",
                unit: "ml",
              },
            ],
          })
        ).id;
        assert.equal(
          (
            await request(`/variants/${variant}/cost-preview`, "POST", {
              selections: [{ attachmentId: a, portions: 1 }],
            })
          ).cost,
          "2.10000000",
        );
        const d = await request(`/materials/${tea}`);
        const alternate = d.measurements.find(
          (y: any) => y.quantity === "2000.00000000",
        );
        assert.ok(alternate);
        await request(`/materials/${tea}/standard-yield`, "PUT", {
          measurementId: alternate.id,
          version: d.head.row_version,
        });
        assert.equal(
          (await request(`/variants/${variant}/cost`)).cost,
          "4.90000000",
        );
        assert.ok((await request("/audit")).length > 10);
        assert.equal((await request("/profitability")).length, 1);
      },
    );
    await t.test(
      "existing products are read-only price sources for independent sizes",
      async () => {
        const products = await request("/products");
        assert.ok(
          products.length > 0,
          "The local catalog needs an existing active product.",
        );
        const product = products[0];
        const size = (
          await request("/sizes", "POST", { code: "L", label: "Large" })
        ).id;
        const large = (
          await request(`/recipes/${recipe}/variants`, "POST", {
            sizeId: size,
            productId: product.id,
            priceSource: "PRODUCT",
            taxBasis: "EXCLUSIVE",
            gstRate: "0",
          })
        ).id;
        await request(`/variants/${large}/revisions`, "POST", {
          lines: [
            { materialId: tea, quantity: "600", unit: "ml" },
            { materialId: cup, quantity: "1", unit: "each" },
          ],
        });
        const quote = await request(`/variants/${large}/cost`);
        assert.equal(quote.cost, "7.30000000");
        assert.equal(quote.retailPrice, product.price);
        const afterProducts = await request("/products");
        assert.deepEqual(afterProducts, products);
        assert.equal((await request(`/recipes/${recipe}`)).variants.length, 2);
      },
    );
    await t.test(
      "invalid JSON shapes and missing tax configuration are rejected",
      async () => {
        await request("/materials", "POST", [], 422);
        await request(
          `/materials/${leaves}/prices`,
          "POST",
          {
            amount: "1",
            quantity: "10",
            unit: "g",
            gstRate: "0.15",
            version: 2,
          },
          422,
        );
        await request(
          `/variants/${variant}/cost-preview`,
          "POST",
          { selections: [null] },
          422,
        );
        await request(
          `/variants/${variant}/revisions`,
          "POST",
          { version: 1, lines: [null] },
          422,
        );
      },
    );
    await t.test(
      "unpriced dependencies are incomplete, and unused materials can be archived",
      async () => {
        const unpriced = await material("Unpriced ingredient");
        const otherRecipe = (
          await request("/recipes", "POST", { name: "Incomplete drink" })
        ).id;
        const size = (
          await request("/sizes", "POST", { code: "X", label: "Test size" })
        ).id;
        const otherVariant = (
          await request(`/recipes/${otherRecipe}/variants`, "POST", {
            sizeId: size,
            priceSource: "OVERRIDE",
            priceOverride: "0",
            taxBasis: "EXCLUSIVE",
            gstRate: "0",
          })
        ).id;
        await request(`/variants/${otherVariant}/revisions`, "POST", {
          lines: [{ materialId: unpriced, quantity: "1", unit: "g" }],
        });
        await request(`/variants/${otherVariant}/cost`, "GET", undefined, 422);
        await request(
          `/materials/${unpriced}/archive`,
          "POST",
          { version: 1 },
          409,
        );
        const unused = await material("Unused material");
        await request(`/materials/${unused}/archive`, "POST", { version: 1 });
        assert.equal(
          (await request(`/materials/${unused}`)).material.status,
          "ARCHIVED",
        );
      },
    );
    await t.test(
      "inconsistent global unit records block costing rather than changing conversions",
      async () => {
        await raw.execute(
          "UPDATE costing_units SET canonical_factor=999 WHERE code='g'",
        );
        try {
          await request("/materials", "GET", undefined, 503);
        } finally {
          await raw.execute(
            "UPDATE costing_units SET canonical_factor=1 WHERE code='g'",
          );
        }
      },
    );
    await t.test(
      "low-cost tea propagates through saved preparation and drink APIs with no precision loss",
      async () => {
        const leaves = await material("PRECISION_LEAVES");
        const tea = await material("PRECISION_TEA", "PREPARED", "ml");
        await request(`/materials/${leaves}/prices`, "POST", {
          amount: "26",
          quantity: "500",
          unit: "g",
          taxBasis: "EXCLUSIVE",
          gstRate: "0.15",
        });
        await request(`/materials/${tea}/preparation`, "POST", {
          lines: [{ materialId: leaves, quantity: "60", unit: "g" }],
          yieldQuantity: "3000",
          yieldUnit: "ml",
        });
        const saved = (await request("/materials")).find(
          (m: any) => m.id === tea,
        );
        assert.equal(saved.unitCost, "0.00104000");
        const size = (
          await request("/sizes", "POST", {
            code: "PRECISION",
            label: "Precision test",
          })
        ).id;
        const recipe = (
          await request("/recipes", "POST", { name: "Precision tea test" })
        ).id;
        const variant = (
          await request(`/recipes/${recipe}/variants`, "POST", {
            sizeId: size,
            priceSource: "OVERRIDE",
            priceOverride: "5.75",
            taxBasis: "INCLUSIVE",
            gstRate: "0.15",
          })
        ).id;
        await request(`/variants/${variant}/revisions`, "POST", {
          lines: [{ materialId: tea, quantity: "450", unit: "ml" }],
        });
        const cost = await request(`/variants/${variant}/cost`);
        assert.equal(cost.cost, "0.46800000");
        assert.equal(cost.marginPercent, "90.6400");
        assert.equal(cost.breakdown[0].quantity, "450.00000000");
        const tiny = await material("PRECISION_TINY", "PREPARED", "ml");
        await request(`/materials/${tiny}/preparation`, "POST", {
          lines: [{ materialId: tea, quantity: "1", unit: "ml" }],
          yieldQuantity: "1000000000",
          yieldUnit: "ml",
        });
        const tinyCost = (await request("/materials")).find(
          (m: any) => m.id === tiny,
        ).unitCost;
        assert.match(tinyCost, /^0\.0+104/);
        assert.notEqual(tinyCost, "0.00000000");
        const priceHistory = await request(`/materials/${leaves}`);
        assert.equal(priceHistory.prices[0].amount, "26.00000000");
        assert.equal(priceHistory.prices[0].usable_quantity, "500.00000000");
      },
    );
    await t.test(
      "viewer cannot write, and access boundaries use current database grants",
      async () => {
        await raw.execute(
          "UPDATE costing_staff_access SET permission='VIEWER' WHERE brand_id=? AND location_id=? AND staff_user_id=?",
          [brandId, locations[0], staffId],
        );
        await request("/materials", "GET");
        await request(
          "/materials",
          "POST",
          { code: "DENIED", name: "Denied", kind: "RAW", unit: "g" },
          403,
        );
        await request("/staff", "GET", undefined, 403);
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
