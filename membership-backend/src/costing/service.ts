import { costingTarget } from "./db.js";
import { matchesCostingTarget } from "./target.js";
import { inventorySpec, ensureNoActiveInventory } from "./inventory-links.js";
import type { Pool, PoolConnection } from "mysql2/promise";
import {
  createCalculator,
  convert,
  customise,
  exclusive,
  type Line,
  type Material,
  type Effect,
  type Price,
} from "./calculator.js";
import { Decimal } from "./decimal.js";
import {
  CostingError,
  ensure,
  id,
  text,
  decimal,
  unit,
  choice,
  price,
  integer,
  version,
} from "./validation.js";
type Row = Record<string, any>;
type Input = Record<string, any>;
export interface Scope {
  brandId: string;
  locationId: string;
  staffId: string;
}
const scopeValues = (s: Scope) => [s.brandId, s.locationId];
const mutable = new Set([
  "materials",
  "drink_recipes",
  "recipe_variants",
  "material_price_heads",
  "preparation_heads",
  "recipe_heads",
]);
const scoped = new Set([
  "materials",
  "material_prices",
  "material_price_heads",
  "preparation_revisions",
  "preparation_lines",
  "yield_measurements",
  "preparation_heads",
  "sizes",
  "drink_recipes",
  "recipe_variants",
  "recipe_revisions",
  "recipe_lines",
  "recipe_heads",
  "option_groups",
  "options",
  "variant_option_groups",
  "variant_options",
  "option_effects",
  "product_links",
  "staff_access",
  "audit_events",
]);
async function rows(
  c: PoolConnection,
  sql: string,
  values: any[] = [],
): Promise<Row[]> {
  const [result] = await c.query(sql, values);
  return result as Row[];
}
async function insert(
  c: PoolConnection,
  table: string,
  s: Scope,
  data: Input,
): Promise<string> {
  ensure(scoped.has(table), "Invalid costing resource.");
  const fields = ["brand_id", "location_id", ...Object.keys(data)];
  const [result]: any = await c.execute(
    `INSERT INTO costing_${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
    [...scopeValues(s), ...Object.values(data)],
  );
  return String(result.insertId);
}
async function get(
  c: PoolConnection,
  table: string,
  s: Scope,
  recordId: unknown,
): Promise<Row> {
  ensure(scoped.has(table), "Invalid costing resource.");
  const [row] = await rows(
    c,
    `SELECT * FROM costing_${table} WHERE brand_id=? AND location_id=? AND id=?`,
    [...scopeValues(s), id(recordId)],
  );
  ensure(row, "Record not found in this location.", 404);
  return row;
}
async function update(
  c: PoolConnection,
  table: string,
  s: Scope,
  row: Row,
  expected: unknown,
  data: Input,
) {
  ensure(mutable.has(table), "This record is immutable.");
  ensure(
    expected !== undefined,
    "This record changed. Reload before saving.",
    409,
  );
  ensure(
    Number(row.row_version) === version(expected),
    "This record changed. Reload before saving.",
    409,
  );
  const [result]: any = await c.execute(
    `UPDATE costing_${table} SET ${Object.keys(data)
      .map((k) => `${k}=?`)
      .join(
        ",",
      )}, row_version=row_version+1 WHERE brand_id=? AND location_id=? AND id=? AND row_version=?`,
    [...Object.values(data), ...scopeValues(s), row.id, expected],
  );
  ensure(
    result.affectedRows === 1,
    "This record changed. Reload before saving.",
    409,
  );
}
async function audit(
  c: PoolConnection,
  s: Scope,
  entity: string,
  entityId: string,
  action: string,
  details: Input = {},
) {
  await insert(c, "audit_events", s, {
    entity_type: entity,
    entity_id: entityId,
    action,
    details: JSON.stringify(details),
    created_by: s.staffId,
  });
}
function mappedLine(line: Row): Line {
  return {
    materialId: String(line.material_id ?? line.input_material_id),
    quantity: String(line.quantity),
    unit: unit(line.unit_code),
  };
}
function safelyCalculate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CostingError) throw error;
    throw new CostingError(
      422,
      `Costing is incomplete: ${error instanceof Error ? error.message : "invalid inputs"}.`,
    );
  }
}
export class CostingService {
  constructor(readonly pool: Pool) {}
  private async verifyTarget(c: PoolConnection) {
    const [[identity]]: any = await c.query(
      "SELECT DATABASE() AS db, @@port AS port, @@server_uuid AS uuid, @@datadir AS dir",
    );
    ensure(
      matchesCostingTarget(identity, costingTarget),
      "Unapproved database target.",
      503,
    );
    const configured = await rows(
      c,
      "SELECT code,dimension,canonical_factor FROM costing_units",
    );
    const expected = [
      ["g", "MASS", "1"],
      ["kg", "MASS", "1000"],
      ["ml", "VOLUME", "1"],
      ["l", "VOLUME", "1000"],
      ["each", "COUNT", "1"],
      ["dozen", "COUNT", "12"],
    ];
    ensure(
      expected.every(([code, dimension, factor]) =>
        configured.some(
          (u) =>
            u.code === code &&
            u.dimension === dimension &&
            Decimal.of(u.canonical_factor).compare(Decimal.of(factor!)) === 0,
        ),
      ),
      "Costing unit reference data is missing or inconsistent.",
      503,
    );
  }
  async transaction<T>(
    s: Scope,
    write: boolean,
    fn: (c: PoolConnection, permission: string) => Promise<T>,
  ): Promise<T> {
    s = {
      brandId: id(s.brandId),
      locationId: id(s.locationId),
      staffId: id(s.staffId),
    };
    const c = await this.pool.getConnection();
    try {
      await c.query(
        write
          ? "START TRANSACTION"
          : "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
      );
      await this.verifyTarget(c);
      const [brand] = await rows(
        c,
        `SELECT * FROM costing_brands WHERE id=? ${write ? "FOR UPDATE" : ""}`,
        [s.brandId],
      );
      ensure(brand?.status === "ACTIVE", "Brand is unavailable.", 404);
      const [location] = await rows(
        c,
        `SELECT id FROM costing_locations WHERE id=? AND brand_id=? ${write ? "FOR UPDATE" : ""}`,
        [s.locationId, s.brandId],
      );
      ensure(location, "Location not found.", 404);
      const [access] = await rows(
        c,
        `SELECT a.permission FROM costing_staff_access a JOIN staff_users u ON u.id=a.staff_user_id WHERE a.brand_id=? AND a.location_id=? AND a.staff_user_id=? AND u.status='ACTIVE'`,
        [...scopeValues(s), s.staffId],
      );
      ensure(access, "Recipe Costing access is required.", 403);
      if (write)
        ensure(
          ["EDITOR", "ADMIN"].includes(access.permission),
          "Read-only costing access.",
          403,
        );
      const result = await fn(c, access.permission);
      await c.commit();
      return result;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async context(staffId: string) {
    const c = await this.pool.getConnection();
    try {
      await this.verifyTarget(c);
      const locations = await rows(
        c,
        `SELECT b.id AS brandId,b.name AS brandName,b.currency_code AS currency,l.id AS locationId,l.name AS locationName,a.permission FROM costing_staff_access a JOIN costing_brands b ON b.id=a.brand_id JOIN costing_locations l ON l.id=a.location_id AND l.brand_id=b.id JOIN staff_users u ON u.id=a.staff_user_id WHERE a.staff_user_id=? AND b.status='ACTIVE' AND u.status='ACTIVE' ORDER BY b.name,l.name`,
        [id(staffId)],
      );
      const units = await rows(
        c,
        "SELECT code,dimension,canonical_factor AS factor FROM costing_units ORDER BY id",
      );
      return { locations, units };
    } finally {
      c.release();
    }
  }
  async list(s: Scope, resource: string, filters: Input = {}) {
    return this.transaction(s, false, async (c, permission) => {
      if (resource === "staff" || resource === "staff_access")
        ensure(permission === "ADMIN", "Administrator access required.", 403);
      if (resource === "products")
        return rows(
          c,
          `SELECT id,product_code AS code,name,category,price,status FROM products WHERE status='ACTIVE' ORDER BY name`,
        );
      if (resource === "staff")
        return rows(
          c,
          `SELECT id,first_name AS firstName,last_name AS lastName,email,role FROM staff_users WHERE status='ACTIVE' ORDER BY id`,
        );
      ensure(
        [
          "materials",
          "sizes",
          "drink_recipes",
          "option_groups",
          "options",
          "staff_access",
        ].includes(resource),
        "Unknown library.",
        404,
      );
      let sql = `SELECT * FROM costing_${resource} WHERE brand_id=? AND location_id=?`;
      const values: any[] = scopeValues(s);
      if (resource === "materials" && filters.kind) {
        sql += " AND kind=?";
        values.push(choice(filters.kind, ["RAW", "PREPARED", "PACKAGING"]));
      }
      if (
        filters.search &&
        ["materials", "drink_recipes", "option_groups", "options"].includes(
          resource,
        )
      ) {
        sql += " AND name LIKE ?";
        values.push(`%${text(filters.search)}%`);
      }
      sql += " ORDER BY id DESC LIMIT 1000";
      const result = await rows(c, sql, values);
      if (resource === "materials") {
        const snapshot = await this.materialSnapshot(c, s);
        for (const item of result) {
          try {
            item.unitCost = safelyCalculate(() =>
              createCalculator(snapshot)
                .unitCost(String(item.id))
                .toCostString(),
            );
            item.costError = null;
          } catch (error) {
            item.unitCost = null;
            item.costError =
              error instanceof Error ? error.message : "Incomplete costing.";
          }
        }
      }
      return result;
    });
  }
  async saveMaterial(s: Scope, input: Input, recordId?: string) {
    return this.transaction(s, true, async (c) => {
      const data = {
        code: text(input.code, 50),
        name: text(input.name),
        unit_code: unit(input.unit),
        kind: choice(input.kind, ["RAW", "PREPARED", "PACKAGING"]),
      };
      let materialId: string;
      if (recordId) {
        const old = await get(c, "materials", s, recordId);
        ensure(
          old.status === "ACTIVE",
          "Archived materials cannot be edited.",
          409,
        );
        ensure(
          old.kind === data.kind && old.unit_code === data.unit_code,
          "Material type and unit cannot change; create a new material instead.",
          409,
        );
        await update(c, "materials", s, old, input.version, {
          code: data.code,
          name: data.name,
        });
        materialId = String(old.id);
      } else materialId = await insert(c, "materials", s, data);
      await audit(
        c,
        s,
        "material",
        materialId,
        recordId ? "UPDATED" : "CREATED",
      );
      return { id: materialId };
    });
  }
  async addPrice(s: Scope, materialId: string, input: Input) {
    return this.transaction(s, true, (c) =>
      this.addPriceWithinTransaction(c, s, materialId, input),
    );
  }
  // Internal shared write path: caller must hold the scoped transaction/locks.
  async addPriceWithinTransaction(
    c: PoolConnection,
    s: Scope,
    materialId: string,
    input: Input,
  ) {
    const material = await get(c, "materials", s, materialId);
    ensure(
      material.status === "ACTIVE" && material.kind !== "PREPARED",
      "Only active raw or packaging materials accept entered prices.",
    );
    const p = price(input);
    const spec = await inventorySpec(c, s, material);
    if (spec?.compatible)
      ensure(
        String(input.inventorySpecId) === spec.id,
        "The pack specification has changed. Refresh before entering a price.",
        409,
      );
    else
      ensure(
        !input.inventorySpecId,
        "The current pack specification is incompatible with the costing unit.",
      );
    const quantity = spec?.compatible
      ? spec.quantity
      : decimal(input.quantity, true);
    const u = spec?.compatible ? unit(spec.unit) : unit(input.unit);
    safelyCalculate(() => convert(quantity, u, unit(material.unit_code)));
    const priceId = await insert(c, "material_prices", s, {
      material_id: material.id,
      amount: p.amount,
      usable_quantity: quantity,
      unit_code: u,
      tax_basis: p.taxBasis,
      gst_rate: p.gstRate,
      notes: typeof input.notes === "string" ? input.notes.slice(0, 500) : null,
      created_by: s.staffId,
    });
    const [head] = await rows(
      c,
      "SELECT * FROM costing_material_price_heads WHERE brand_id=? AND location_id=? AND material_id=?",
      [...scopeValues(s), material.id],
    );
    if (head)
      await update(c, "material_price_heads", s, head, input.version, {
        price_id: priceId,
      });
    else {
      ensure(!input.version, "Price changed; reload.", 409);
      await insert(c, "material_price_heads", s, {
        material_id: material.id,
        price_id: priceId,
      });
    }
    await audit(c, s, "material", String(material.id), "PRICE_CHANGED", {
      priceId,
    });
    return { id: priceId };
  }
  async materialDetail(s: Scope, materialId: string) {
    return this.transaction(s, false, async (c) => {
      const material = await get(c, "materials", s, materialId);
      const prices = await rows(
        c,
        "SELECT * FROM costing_material_prices WHERE brand_id=? AND location_id=? AND material_id=? ORDER BY id DESC",
        [...scopeValues(s), material.id],
      );
      const [priceHead] = await rows(
        c,
        "SELECT * FROM costing_material_price_heads WHERE brand_id=? AND location_id=? AND material_id=?",
        [...scopeValues(s), material.id],
      );
      const [head] = await rows(
        c,
        "SELECT * FROM costing_preparation_heads WHERE brand_id=? AND location_id=? AND material_id=?",
        [...scopeValues(s), material.id],
      );
      const revisions = await rows(
        c,
        "SELECT * FROM costing_preparation_revisions WHERE brand_id=? AND location_id=? AND material_id=? ORDER BY revision DESC",
        [...scopeValues(s), material.id],
      );
      const measurements = await rows(
        c,
        `SELECT y.* FROM costing_yield_measurements y JOIN costing_preparation_revisions r ON r.id=y.preparation_revision_id AND r.brand_id=y.brand_id AND r.location_id=y.location_id WHERE y.brand_id=? AND y.location_id=? AND r.material_id=? ORDER BY y.id DESC`,
        [...scopeValues(s), material.id],
      );
      const lines = head
        ? await rows(
            c,
            "SELECT * FROM costing_preparation_lines WHERE brand_id=? AND location_id=? AND preparation_revision_id=? ORDER BY id",
            [...scopeValues(s), head.preparation_revision_id],
          )
        : [];
      return {
        material,
        inventorySpec: await inventorySpec(c, s, material),
        prices,
        priceHead: priceHead ?? null,
        head: head ?? null,
        revisions,
        measurements,
        lines,
      };
    });
  }
  private async validateLines(
    c: PoolConnection,
    s: Scope,
    input: unknown,
  ): Promise<Line[]> {
    ensure(
      Array.isArray(input) && input.length > 0 && input.length <= 100,
      "Add between 1 and 100 ingredient lines.",
    );
    const result: Line[] = [];
    for (const line of input) {
      ensure(
        line && typeof line === "object" && !Array.isArray(line),
        "Invalid ingredient line.",
      );
      const material = await get(c, "materials", s, line.materialId);
      ensure(material.status === "ACTIVE", "An ingredient is archived.");
      const quantity = decimal(line.quantity, true);
      const u = unit(line.unit);
      safelyCalculate(() => convert(quantity, u, unit(material.unit_code)));
      result.push({ materialId: String(material.id), quantity, unit: u });
    }
    return result;
  }
  async savePreparation(s: Scope, materialId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const material = await get(c, "materials", s, materialId);
      ensure(
        material.kind === "PREPARED" && material.status === "ACTIVE",
        "Choose an active prepared ingredient.",
      );
      const lines = await this.validateLines(c, s, input.lines);
      const quantity = decimal(input.yieldQuantity, true);
      const u = unit(input.yieldUnit);
      safelyCalculate(() => convert(quantity, u, unit(material.unit_code)));
      const [head] = await rows(
        c,
        "SELECT * FROM costing_preparation_heads WHERE brand_id=? AND location_id=? AND material_id=?",
        [...scopeValues(s), material.id],
      );
      ensure(
        head
          ? Number(head.row_version) === version(input.version)
          : !input.version,
        "Preparation changed; reload.",
        409,
      );
      const snapshot = await this.materialSnapshot(c, s);
      const prospective: Material = {
        id: String(material.id),
        kind: "PREPARED",
        unit: unit(material.unit_code),
        yield: { quantity, unit: u },
        inputs: lines,
      };
      safelyCalculate(() =>
        createCalculator([
          ...snapshot.filter((m) => m.id !== String(material.id)),
          prospective,
        ]).unitCost(String(material.id)),
      );
      const [[latest]]: any = await c.query(
        "SELECT COALESCE(MAX(revision),0)+1 AS n FROM costing_preparation_revisions WHERE brand_id=? AND location_id=? AND material_id=?",
        [...scopeValues(s), material.id],
      );
      const revisionId = await insert(c, "preparation_revisions", s, {
        material_id: material.id,
        revision: latest.n,
        instructions:
          typeof input.instructions === "string"
            ? input.instructions.slice(0, 10000)
            : null,
        created_by: s.staffId,
      });
      for (const line of lines)
        await insert(c, "preparation_lines", s, {
          preparation_revision_id: revisionId,
          input_material_id: line.materialId,
          quantity: line.quantity,
          unit_code: line.unit,
        });
      const yieldId = await insert(c, "yield_measurements", s, {
        preparation_revision_id: revisionId,
        quantity,
        unit_code: u,
        measured_at: new Date(),
        notes: null,
        created_by: s.staffId,
      });
      if (head)
        await update(c, "preparation_heads", s, head, input.version, {
          preparation_revision_id: revisionId,
          yield_measurement_id: yieldId,
        });
      else
        await insert(c, "preparation_heads", s, {
          material_id: material.id,
          preparation_revision_id: revisionId,
          yield_measurement_id: yieldId,
        });
      await audit(
        c,
        s,
        "material",
        String(material.id),
        "PREPARATION_REVISED",
        { revisionId, yieldId },
      );
      return { id: revisionId };
    });
  }
  async addYield(s: Scope, materialId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const material = await get(c, "materials", s, materialId);
      ensure(
        material.kind === "PREPARED" && material.status === "ACTIVE",
        "Prepared ingredient is unavailable.",
      );
      const revision = await get(
        c,
        "preparation_revisions",
        s,
        input.revisionId,
      );
      ensure(
        String(revision.material_id) === String(material.id),
        "Yield belongs to another preparation.",
      );
      const quantity = decimal(input.quantity, true);
      const u = unit(input.unit);
      safelyCalculate(() => convert(quantity, u, unit(material.unit_code)));
      const measurementId = await insert(c, "yield_measurements", s, {
        preparation_revision_id: revision.id,
        quantity,
        unit_code: u,
        measured_at: new Date(),
        notes:
          typeof input.notes === "string" ? input.notes.slice(0, 500) : null,
        created_by: s.staffId,
      });
      if (input.select === true)
        await this.selectYieldInternal(
          c,
          s,
          material,
          measurementId,
          input.version,
        );
      await audit(c, s, "material", String(material.id), "YIELD_MEASURED", {
        measurementId,
        selected: input.select === true,
      });
      return { id: measurementId };
    });
  }
  private async selectYieldInternal(
    c: PoolConnection,
    s: Scope,
    material: Row,
    measurementId: string,
    expected: unknown,
  ) {
    const measurement = await get(c, "yield_measurements", s, measurementId);
    const revision = await get(
      c,
      "preparation_revisions",
      s,
      measurement.preparation_revision_id,
    );
    ensure(
      String(revision.material_id) === String(material.id),
      "Yield belongs to another ingredient.",
    );
    const [head] = await rows(
      c,
      "SELECT * FROM costing_preparation_heads WHERE brand_id=? AND location_id=? AND material_id=?",
      [...scopeValues(s), material.id],
    );
    ensure(head, "Save a preparation first.");
    ensure(
      String(head.preparation_revision_id) === String(revision.id),
      "Select a measurement of the current preparation revision.",
    );
    await update(c, "preparation_heads", s, head, expected, {
      yield_measurement_id: measurement.id,
    });
  }
  async selectYield(s: Scope, materialId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const material = await get(c, "materials", s, materialId);
      ensure(
        material.status === "ACTIVE" && material.kind === "PREPARED",
        "Prepared ingredient unavailable.",
      );
      await this.selectYieldInternal(
        c,
        s,
        material,
        id(input.measurementId),
        input.version,
      );
      await audit(c, s, "material", materialId, "STANDARD_YIELD_CHANGED");
      return { id: materialId };
    });
  }
  private async materialSnapshot(
    c: PoolConnection,
    s: Scope,
  ): Promise<Material[]> {
    const materials = await rows(
      c,
      "SELECT * FROM costing_materials WHERE brand_id=? AND location_id=?",
      [...scopeValues(s)],
    );
    const prices = await rows(
      c,
      `SELECT p.* FROM costing_material_price_heads h JOIN costing_material_prices p ON p.id=h.price_id AND p.material_id=h.material_id AND p.brand_id=h.brand_id AND p.location_id=h.location_id WHERE h.brand_id=? AND h.location_id=?`,
      scopeValues(s),
    );
    const preparations = await rows(
      c,
      `SELECT h.*,y.quantity,y.unit_code FROM costing_preparation_heads h JOIN costing_preparation_revisions r ON r.id=h.preparation_revision_id AND r.material_id=h.material_id AND r.brand_id=h.brand_id AND r.location_id=h.location_id JOIN costing_yield_measurements y ON y.id=h.yield_measurement_id AND y.preparation_revision_id=r.id AND y.brand_id=h.brand_id AND y.location_id=h.location_id WHERE h.brand_id=? AND h.location_id=?`,
      scopeValues(s),
    );
    const lines = await rows(
      c,
      "SELECT * FROM costing_preparation_lines WHERE brand_id=? AND location_id=?",
      scopeValues(s),
    );
    return materials
      .filter((m) => m.status === "ACTIVE")
      .flatMap((m): Material[] => {
        if (m.kind === "PREPARED") {
          const h = preparations.find(
            (p) => String(p.material_id) === String(m.id),
          );
          if (!h) return [];
          return [
            {
              id: String(m.id),
              kind: "PREPARED",
              unit: unit(m.unit_code),
              yield: { quantity: h.quantity, unit: unit(h.unit_code) },
              inputs: lines
                .filter(
                  (l) =>
                    String(l.preparation_revision_id) ===
                    String(h.preparation_revision_id),
                )
                .map(mappedLine),
            },
          ];
        }
        const p = prices.find((p) => String(p.material_id) === String(m.id));
        if (!p) return [];
        return [
          {
            id: String(m.id),
            kind: choice(m.kind, ["RAW", "PACKAGING"]),
            unit: unit(m.unit_code),
            price: {
              amount: p.amount,
              taxBasis: p.tax_basis,
              gstRate: p.gst_rate,
            },
            usable: { quantity: p.usable_quantity, unit: unit(p.unit_code) },
          },
        ];
      });
  }
  async createSimple(s: Scope, resource: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      let data: Input;
      if (resource === "sizes")
        data = {
          code: text(input.code, 30),
          label: text(input.label, 100),
          nominal_volume_ml: input.nominalVolume
            ? decimal(input.nominalVolume, true)
            : null,
        };
      else if (resource === "drink_recipes") data = { name: text(input.name) };
      else if (resource === "option_groups") {
        const min = integer(input.min ?? 0);
        const max = integer(input.max ?? 1);
        ensure(max >= min, "Maximum selections must be at least the minimum.");
        data = {
          name: text(input.name, 100),
          min_selections: min,
          max_selections: max,
        };
      } else if (resource === "options") {
        await get(c, "option_groups", s, input.groupId);
        data = {
          option_group_id: id(input.groupId),
          name: text(input.name, 100),
          kind: choice(input.kind, [
            "TOPPING",
            "SUGAR",
            "ICE",
            "SUBSTITUTION",
            "OTHER",
          ]),
        };
      } else throw new CostingError(404, "Unknown library.");
      const recordId = await insert(c, resource, s, data);
      await audit(c, s, resource, recordId, "CREATED");
      return { id: recordId };
    });
  }
  private async variantData(
    c: PoolConnection,
    s: Scope,
    input: Input,
  ): Promise<Input> {
    await get(c, "sizes", s, input.sizeId);
    let productLink: string | null = null;
    if (input.productId) {
      const [product] = await rows(
        c,
        "SELECT id FROM products WHERE id=? AND status='ACTIVE'",
        [id(input.productId)],
      );
      ensure(product, "Product not found or inactive.");
      const [link] = await rows(
        c,
        "SELECT * FROM costing_product_links WHERE brand_id=? AND location_id=? AND product_id=?",
        [...scopeValues(s), product.id],
      );
      productLink = link
        ? String(link.id)
        : await insert(c, "product_links", s, { product_id: product.id });
    }
    const source = choice(input.priceSource, ["PRODUCT", "OVERRIDE"]);
    ensure(
      source !== "PRODUCT" || productLink,
      "Choose an existing product for product pricing.",
    );
    const p = price({
      amount: source === "OVERRIDE" ? input.priceOverride : "0",
      taxBasis: input.taxBasis,
      gstRate: input.gstRate,
    });
    return {
      size_id: id(input.sizeId),
      product_link_id: productLink,
      price_source: source,
      price_override: source === "OVERRIDE" ? p.amount : null,
      tax_basis: p.taxBasis,
      gst_rate: p.gstRate,
    };
  }
  async saveVariant(
    s: Scope,
    recipeId: string,
    input: Input,
    variantId?: string,
  ) {
    return this.transaction(s, true, async (c) => {
      const recipe = await get(c, "drink_recipes", s, recipeId);
      ensure(recipe.status === "ACTIVE", "Archived recipe cannot be edited.");
      const data = await this.variantData(c, s, input);
      let resultId: string;
      if (variantId) {
        const variant = await get(c, "recipe_variants", s, variantId);
        ensure(
          String(variant.drink_recipe_id) === String(recipe.id),
          "Variant belongs to another drink.",
        );
        await update(c, "recipe_variants", s, variant, input.version, data);
        resultId = String(variant.id);
      } else
        resultId = await insert(c, "recipe_variants", s, {
          drink_recipe_id: recipe.id,
          ...data,
        });
      await audit(c, s, "variant", resultId, "SAVED");
      return { id: resultId };
    });
  }
  async recipeDetail(s: Scope, recipeId: string) {
    return this.transaction(s, false, async (c) => {
      const recipe = await get(c, "drink_recipes", s, recipeId);
      const variants = await rows(
        c,
        `SELECT v.*,z.label AS size_label,p.product_id FROM costing_recipe_variants v JOIN costing_sizes z ON z.id=v.size_id AND z.brand_id=v.brand_id AND z.location_id=v.location_id LEFT JOIN costing_product_links p ON p.id=v.product_link_id AND p.brand_id=v.brand_id AND p.location_id=v.location_id WHERE v.brand_id=? AND v.location_id=? AND v.drink_recipe_id=? ORDER BY v.id`,
        [...scopeValues(s), recipe.id],
      );
      for (const v of variants) {
        const [head] = await rows(
          c,
          "SELECT * FROM costing_recipe_heads WHERE brand_id=? AND location_id=? AND variant_id=?",
          [...scopeValues(s), v.id],
        );
        v.head = head ?? null;
        v.lines = head
          ? await rows(
              c,
              "SELECT * FROM costing_recipe_lines WHERE brand_id=? AND location_id=? AND recipe_revision_id=? ORDER BY display_order,id",
              [...scopeValues(s), head.recipe_revision_id],
            )
          : [];
        v.revisions = await rows(
          c,
          "SELECT id,revision,created_at FROM costing_recipe_revisions WHERE brand_id=? AND location_id=? AND variant_id=? ORDER BY revision DESC",
          [...scopeValues(s), v.id],
        );
      }
      return { recipe, variants };
    });
  }
  async saveRecipeLines(s: Scope, variantId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const variant = await get(c, "recipe_variants", s, variantId);
      const recipe = await get(c, "drink_recipes", s, variant.drink_recipe_id);
      ensure(recipe.status === "ACTIVE", "Archived drink cannot be edited.");
      const lines = await this.validateLines(c, s, input.lines);
      const [head] = await rows(
        c,
        "SELECT * FROM costing_recipe_heads WHERE brand_id=? AND location_id=? AND variant_id=?",
        [...scopeValues(s), variant.id],
      );
      ensure(
        head
          ? Number(head.row_version) === version(input.version)
          : !input.version,
        "Recipe changed; reload.",
        409,
      );
      // Existing customisations must be explicitly rebuilt against new line IDs.
      const effects = head
        ? await rows(
            c,
            "SELECT id FROM costing_option_effects WHERE brand_id=? AND location_id=? AND variant_id=? AND recipe_revision_id=? LIMIT 1",
            [...scopeValues(s), variant.id, head.recipe_revision_id],
          )
        : [];
      ensure(
        !effects.length || input.resetCustomisations === true,
        "This recipe has customisations. Confirm resetting their effects before revising lines.",
        409,
      );
      const [[latest]]: any = await c.query(
        "SELECT COALESCE(MAX(revision),0)+1 AS n FROM costing_recipe_revisions WHERE brand_id=? AND location_id=? AND variant_id=?",
        [...scopeValues(s), variant.id],
      );
      const revisionId = await insert(c, "recipe_revisions", s, {
        variant_id: variant.id,
        revision: latest.n,
        created_by: s.staffId,
      });
      for (const [i, line] of lines.entries())
        await insert(c, "recipe_lines", s, {
          recipe_revision_id: revisionId,
          material_id: line.materialId,
          quantity: line.quantity,
          unit_code: line.unit,
          display_order: i,
        });
      if (head)
        await update(c, "recipe_heads", s, head, input.version, {
          recipe_revision_id: revisionId,
        });
      else
        await insert(c, "recipe_heads", s, {
          variant_id: variant.id,
          recipe_revision_id: revisionId,
        });
      await audit(c, s, "variant", String(variant.id), "RECIPE_REVISED", {
        revisionId,
        customisationsRequireReview: effects.length > 0,
      });
      return { id: revisionId };
    });
  }
  async variantOptions(s: Scope, variantId: string) {
    return this.transaction(s, false, (c) => this.loadOptions(c, s, variantId));
  }
  private async loadOptions(c: PoolConnection, s: Scope, variantId: string) {
    await get(c, "recipe_variants", s, variantId);
    const groups = await rows(
      c,
      `SELECT g.* FROM costing_variant_option_groups a JOIN costing_option_groups g ON g.id=a.option_group_id AND g.brand_id=a.brand_id AND g.location_id=a.location_id WHERE a.brand_id=? AND a.location_id=? AND a.variant_id=? ORDER BY g.id`,
      [...scopeValues(s), variantId],
    );
    const options = await rows(
      c,
      `SELECT a.*,o.name,o.kind FROM costing_variant_options a JOIN costing_options o ON o.id=a.option_id AND o.option_group_id=a.option_group_id AND o.brand_id=a.brand_id AND o.location_id=a.location_id WHERE a.brand_id=? AND a.location_id=? AND a.variant_id=? ORDER BY a.id`,
      [...scopeValues(s), variantId],
    );
    for (const option of options)
      option.effects = await rows(
        c,
        "SELECT * FROM costing_option_effects WHERE brand_id=? AND location_id=? AND variant_option_id=? ORDER BY id",
        [...scopeValues(s), option.id],
      );
    return { groups, options };
  }
  async saveVariantOption(s: Scope, variantId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const variant = await get(c, "recipe_variants", s, variantId);
      const recipe = await get(c, "drink_recipes", s, variant.drink_recipe_id);
      ensure(recipe.status === "ACTIVE", "Archived drink cannot be edited.");
      const option = await get(c, "options", s, input.optionId);
      const group = await get(c, "option_groups", s, option.option_group_id);
      const [head] = await rows(
        c,
        "SELECT * FROM costing_recipe_heads WHERE brand_id=? AND location_id=? AND variant_id=?",
        [...scopeValues(s), variant.id],
      );
      ensure(head, "Save recipe lines first.");
      const p = price({
        amount: input.surcharge,
        taxBasis: input.taxBasis,
        gstRate: input.gstRate,
      });
      const max = integer(input.maxPortions ?? 1, 1, 10);
      const [attached] = await rows(
        c,
        "SELECT id FROM costing_variant_option_groups WHERE brand_id=? AND location_id=? AND variant_id=? AND option_group_id=?",
        [...scopeValues(s), variant.id, group.id],
      );
      if (!attached)
        await insert(c, "variant_option_groups", s, {
          variant_id: variant.id,
          option_group_id: group.id,
        });
      const [existing] = await rows(
        c,
        "SELECT * FROM costing_variant_options WHERE brand_id=? AND location_id=? AND variant_id=? AND option_id=?",
        [...scopeValues(s), variant.id, option.id],
      );
      ensure(
        !existing,
        "This option is already attached. Remove it before changing its effects.",
        409,
      );
      const attachmentId = await insert(c, "variant_options", s, {
        variant_id: variant.id,
        option_group_id: group.id,
        option_id: option.id,
        is_default: input.isDefault === true ? 1 : 0,
        max_portions: max,
        price_adjustment: p.amount,
        tax_basis: p.taxBasis,
        gst_rate: p.gstRate,
      });
      ensure(
        Array.isArray(input.effects) && input.effects.length <= 100,
        "Supply an effects list.",
      );
      const current = await rows(
        c,
        "SELECT * FROM costing_recipe_lines WHERE brand_id=? AND location_id=? AND recipe_revision_id=? ORDER BY display_order,id",
        [...scopeValues(s), head.recipe_revision_id],
      );
      const effects: Effect[] = [];
      for (const e of input.effects) {
        ensure(
          e && typeof e === "object" && !Array.isArray(e),
          "Invalid option effect.",
        );
        const operation = choice(e.operation, [
          "ADD",
          "REMOVE",
          "REPLACE",
          "SET_QUANTITY",
        ]);
        let target: Row | undefined;
        let material: Row | undefined;
        let quantity: string | null = null;
        let u: string | null = null;
        if (operation !== "ADD") {
          target = await get(c, "recipe_lines", s, e.targetLineId);
          ensure(
            String(target.recipe_revision_id) ===
              String(head.recipe_revision_id),
            "Effect target must belong to the current recipe revision.",
          );
        }
        if (operation === "ADD" || operation === "REPLACE") {
          material = await get(c, "materials", s, e.materialId);
          ensure(
            material.status === "ACTIVE",
            "Effect ingredient is archived.",
          );
          quantity = decimal(e.quantity, true);
          u = unit(e.unit);
          safelyCalculate(() =>
            convert(quantity!, u as any, unit(material!.unit_code)),
          );
        }
        if (operation === "SET_QUANTITY") {
          quantity = decimal(e.quantity);
          u = unit(e.unit);
          safelyCalculate(() =>
            convert(quantity!, u as any, unit(target!.unit_code)),
          );
        }
        await insert(c, "option_effects", s, {
          variant_option_id: attachmentId,
          variant_id: variant.id,
          recipe_revision_id: head.recipe_revision_id,
          operation,
          target_line_id: target?.id ?? null,
          material_id: material?.id ?? null,
          quantity,
          unit_code: u,
        });
        const targetIndex = current.findIndex(
          (l) => String(l.id) === String(target?.id),
        );
        if (operation === "ADD")
          effects.push({
            operation,
            line: {
              materialId: String(material!.id),
              quantity: quantity!,
              unit: unit(u),
            },
          });
        else if (operation === "REMOVE")
          effects.push({ operation, target: targetIndex });
        else if (operation === "REPLACE")
          effects.push({
            operation,
            target: targetIndex,
            line: {
              materialId: String(material!.id),
              quantity: quantity!,
              unit: unit(u),
            },
          });
        else
          effects.push({
            operation,
            target: targetIndex,
            quantity: quantity!,
            unit: unit(u),
          });
      }
      safelyCalculate(() => customise(current.map(mappedLine), effects));
      const defaults = await rows(
        c,
        "SELECT id FROM costing_variant_options WHERE brand_id=? AND location_id=? AND variant_id=? AND option_group_id=? AND is_default=1",
        [...scopeValues(s), variant.id, group.id],
      );
      ensure(
        defaults.length <= Number(group.max_selections),
        "Too many default options for this group.",
      );
      await audit(c, s, "variant", String(variant.id), "OPTION_ATTACHED", {
        attachmentId,
      });
      return { id: attachmentId };
    });
  }
  async removeVariantOption(s: Scope, variantId: string, attachmentId: string) {
    return this.transaction(s, true, async (c) => {
      const variant = await get(c, "recipe_variants", s, variantId);
      const drink = await get(c, "drink_recipes", s, variant.drink_recipe_id);
      ensure(drink.status === "ACTIVE", "Archived drink cannot be edited.");
      const a = await get(c, "variant_options", s, attachmentId);
      ensure(
        String(a.variant_id) === id(variantId),
        "Option belongs to another variant.",
      );
      // These are editable association rows, not immutable recipe/material history.
      await c.execute(
        "DELETE FROM costing_option_effects WHERE brand_id=? AND location_id=? AND variant_option_id=?",
        [...scopeValues(s), a.id],
      );
      await c.execute(
        "DELETE FROM costing_variant_options WHERE brand_id=? AND location_id=? AND id=?",
        [...scopeValues(s), a.id],
      );
      const [remaining] = await rows(
        c,
        "SELECT id FROM costing_variant_options WHERE brand_id=? AND location_id=? AND variant_id=? AND option_group_id=? LIMIT 1",
        [...scopeValues(s), variantId, a.option_group_id],
      );
      if (!remaining)
        await c.execute(
          "DELETE FROM costing_variant_option_groups WHERE brand_id=? AND location_id=? AND variant_id=? AND option_group_id=?",
          [...scopeValues(s), variantId, a.option_group_id],
        );
      await audit(c, s, "variant", variantId, "OPTION_REMOVED", {
        attachmentId,
      });
      return { id: attachmentId };
    });
  }
  private async costInternal(
    c: PoolConnection,
    s: Scope,
    variantId: string,
    input?: Input,
  ) {
    const variant = await get(c, "recipe_variants", s, variantId);
    const drink = await get(c, "drink_recipes", s, variant.drink_recipe_id);
    ensure(drink.status === "ACTIVE", "Drink is archived.");
    await get(c, "sizes", s, variant.size_id);
    const [head] = await rows(
      c,
      "SELECT * FROM costing_recipe_heads WHERE brand_id=? AND location_id=? AND variant_id=?",
      [...scopeValues(s), variant.id],
    );
    ensure(head, "Recipe has no saved formulation.");
    const revision = await get(
      c,
      "recipe_revisions",
      s,
      head.recipe_revision_id,
    );
    ensure(
      String(revision.variant_id) === String(variant.id),
      "Recipe head ownership is invalid.",
    );
    const raw = await rows(
      c,
      "SELECT * FROM costing_recipe_lines WHERE brand_id=? AND location_id=? AND recipe_revision_id=? ORDER BY display_order,id",
      [...scopeValues(s), revision.id],
    );
    let lines = input?.lines
      ? await this.validateLines(c, s, input.lines)
      : raw.map(mappedLine);
    const available = await this.loadOptions(c, s, variantId);
    const selections: Input[] =
      input?.selections ??
      available.options
        .filter((o) => Number(o.is_default) === 1)
        .map((o) => ({ attachmentId: String(o.id), portions: 1 }));
    ensure(
      Array.isArray(selections) && selections.length <= 100,
      "Invalid option selections.",
    );
    for (const selection of selections)
      ensure(
        selection && typeof selection === "object" && !Array.isArray(selection),
        "Invalid option selection.",
      );
    ensure(
      new Set(selections.map((v) => id(v.attachmentId))).size ===
        selections.length,
      "Duplicate option selection.",
    );
    let surcharge = Decimal.of("0");
    const effects: Effect[] = [];
    for (const group of available.groups) {
      const chosen = selections.filter((selected) =>
        available.options.some(
          (o) =>
            String(o.id) === String(selected.attachmentId) &&
            String(o.option_group_id) === String(group.id),
        ),
      );
      ensure(
        chosen.length >= Number(group.min_selections) &&
          chosen.length <= Number(group.max_selections),
        `Choose ${group.min_selections}–${group.max_selections} options for ${group.name}.`,
      );
    }
    for (const selection of selections) {
      const option = available.options.find(
        (o) => String(o.id) === id(selection.attachmentId),
      );
      ensure(option, "Option is not available for this size.");
      const portions = integer(
        selection.portions,
        1,
        Number(option.max_portions),
      );
      surcharge = surcharge.add(
        exclusive({
          amount: option.price_adjustment,
          taxBasis: option.tax_basis,
          gstRate: option.gst_rate,
        }).mul(Decimal.of(String(portions))),
      );
      for (const e of option.effects) {
        ensure(
          String(e.variant_id) === String(variant.id) &&
            String(e.recipe_revision_id) === String(revision.id),
          "Customisation needs rebuilding for the current recipe.",
        );
        ensure(
          !input?.lines,
          "Customisation preview requires the saved formulation.",
        );
        const target = raw.findIndex(
          (l) => String(l.id) === String(e.target_line_id),
        );
        if (e.operation === "ADD")
          effects.push({
            operation: "ADD",
            line: {
              materialId: String(e.material_id),
              quantity: Decimal.of(e.quantity)
                .mul(Decimal.of(String(portions)))
                .toFixed(),
              unit: unit(e.unit_code),
            },
          });
        else {
          ensure(
            portions === 1,
            "Only additive toppings support multiple portions.",
          );
          if (e.operation === "REMOVE")
            effects.push({ operation: "REMOVE", target });
          else if (e.operation === "REPLACE")
            effects.push({
              operation: "REPLACE",
              target,
              line: {
                materialId: String(e.material_id),
                quantity: e.quantity,
                unit: unit(e.unit_code),
              },
            });
          else
            effects.push({
              operation: "SET_QUANTITY",
              target,
              quantity: e.quantity,
              unit: unit(e.unit_code),
            });
        }
      }
    }
    lines = safelyCalculate(() => customise(lines, effects));
    let retail: Price;
    if (variant.price_source === "PRODUCT") {
      const link = await get(c, "product_links", s, variant.product_link_id);
      const [product] = await rows(
        c,
        "SELECT price FROM products WHERE id=? AND status='ACTIVE'",
        [link.product_id],
      );
      ensure(product, "Linked product is unavailable.");
      retail = {
        amount: product.price,
        taxBasis: variant.tax_basis,
        gstRate: variant.gst_rate,
      };
    } else
      retail = {
        amount: variant.price_override,
        taxBasis: variant.tax_basis,
        gstRate: variant.gst_rate,
      };
    const snapshot = await this.materialSnapshot(c, s);
    const base = safelyCalculate(() =>
      createCalculator(snapshot).recipe(lines, retail),
    );
    const revenue = exclusive(retail).add(surcharge);
    // Use unrounded line costs for final profit/margin as well as recipe totals.
    const exactCost = safelyCalculate(() =>
      lines.reduce((sum, l) => {
        const m = snapshot.find((m) => m.id === l.materialId);
        ensure(m, "Ingredient is missing or has no current cost.");
        return sum.add(
          convert(l.quantity, l.unit, m.unit).mul(
            createCalculator(snapshot).unitCost(m.id),
          ),
        );
      }, Decimal.of("0")),
    );
    const exactProfit = revenue.sub(exactCost);
    return {
      ...base,
      revenue: revenue.toFixed(),
      grossProfit: exactProfit.toFixed(),
      marginPercent:
        revenue.compare(Decimal.of("0")) === 0
          ? null
          : exactProfit.div(revenue).mul(Decimal.of("100")).toFixed(4),
      surchargeExclusive: surcharge.toFixed(),
      retailPrice: retail.amount,
      taxBasis: retail.taxBasis,
      gstRate: retail.gstRate,
      calculatedAt: new Date().toISOString(),
      recipeRevisionId: String(revision.id),
      selections,
    };
  }
  async cost(s: Scope, variantId: string, input?: Input) {
    return this.transaction(s, false, (c) =>
      this.costInternal(c, s, variantId, input),
    );
  }
  async profitability(s: Scope) {
    return this.transaction(s, false, async (c) => {
      const variants = await rows(
        c,
        `SELECT v.id,r.name,z.label AS size FROM costing_recipe_variants v JOIN costing_drink_recipes r ON r.id=v.drink_recipe_id AND r.brand_id=v.brand_id AND r.location_id=v.location_id JOIN costing_sizes z ON z.id=v.size_id AND z.brand_id=v.brand_id AND z.location_id=v.location_id WHERE v.brand_id=? AND v.location_id=? AND r.status='ACTIVE' ORDER BY r.name,z.id`,
        scopeValues(s),
      );
      for (const v of variants) {
        try {
          v.costing = await this.costInternal(c, s, String(v.id));
          v.error = null;
        } catch (error) {
          v.costing = null;
          v.error =
            error instanceof CostingError
              ? error.message
              : "Invalid costing dependencies.";
        }
      }
      return variants;
    });
  }
  async dependencies(c: PoolConnection, s: Scope, materialId: string) {
    const prepLines = await rows(
      c,
      `SELECT l.input_material_id,h.material_id FROM costing_preparation_lines l JOIN costing_preparation_heads h ON h.preparation_revision_id=l.preparation_revision_id AND h.brand_id=l.brand_id AND h.location_id=l.location_id JOIN costing_materials m ON m.id=h.material_id AND m.brand_id=h.brand_id AND m.location_id=h.location_id WHERE l.brand_id=? AND l.location_id=? AND m.status='ACTIVE'`,
      scopeValues(s),
    );
    const ids = new Set([materialId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of prepLines)
        if (
          ids.has(String(l.input_material_id)) &&
          !ids.has(String(l.material_id))
        ) {
          ids.add(String(l.material_id));
          changed = true;
        }
    }
    const usages = await rows(
      c,
      `SELECT DISTINCT r.id,r.name,l.material_id FROM costing_recipe_lines l JOIN costing_recipe_heads h ON h.recipe_revision_id=l.recipe_revision_id AND h.brand_id=l.brand_id AND h.location_id=l.location_id JOIN costing_recipe_variants v ON v.id=h.variant_id AND v.brand_id=h.brand_id AND v.location_id=h.location_id JOIN costing_drink_recipes r ON r.id=v.drink_recipe_id AND r.brand_id=v.brand_id AND r.location_id=v.location_id WHERE l.brand_id=? AND l.location_id=? AND r.status='ACTIVE'`,
      scopeValues(s),
    );
    const optionUsages = await rows(
      c,
      `SELECT DISTINCT r.id,r.name,e.material_id FROM costing_option_effects e JOIN costing_recipe_heads h ON h.variant_id=e.variant_id AND h.recipe_revision_id=e.recipe_revision_id AND h.brand_id=e.brand_id AND h.location_id=e.location_id JOIN costing_recipe_variants v ON v.id=h.variant_id AND v.brand_id=h.brand_id AND v.location_id=h.location_id JOIN costing_drink_recipes r ON r.id=v.drink_recipe_id AND r.brand_id=v.brand_id AND r.location_id=v.location_id WHERE e.brand_id=? AND e.location_id=? AND r.status='ACTIVE'`,
      scopeValues(s),
    );
    return {
      preparations: [...ids].filter((x) => x !== materialId),
      recipes: [...usages, ...optionUsages]
        .filter((r) => ids.has(String(r.material_id)))
        .map((r) => ({ id: String(r.id), name: r.name })),
    };
  }
  async dependents(s: Scope, materialId: string) {
    return this.transaction(s, false, async (c) => {
      await get(c, "materials", s, materialId);
      return this.dependencies(c, s, materialId);
    });
  }
  async archive(s: Scope, resource: string, recordId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      ensure(
        ["materials", "drink_recipes"].includes(resource),
        "This library does not support archiving.",
      );
      const row = await get(c, resource, s, recordId);
      if (resource === "materials") {
        await ensureNoActiveInventory(c, s, String(row.id));
        const dependencies = await this.dependencies(c, s, String(row.id));
        ensure(
          !dependencies.preparations.length && !dependencies.recipes.length,
          "This ingredient is required by active preparations, recipes or customisations.",
          409,
        );
      }
      await update(c, resource, s, row, input.version, { status: "ARCHIVED" });
      await audit(c, s, resource, recordId, "ARCHIVED");
      return { id: recordId };
    });
  }
  async rename(s: Scope, recipeId: string, input: Input) {
    return this.transaction(s, true, async (c) => {
      const row = await get(c, "drink_recipes", s, recipeId);
      await update(c, "drink_recipes", s, row, input.version, {
        name: text(input.name),
      });
      await audit(c, s, "drink_recipes", recipeId, "RENAMED");
      return { id: recipeId };
    });
  }
  async history(s: Scope) {
    return this.transaction(s, false, (c) =>
      rows(
        c,
        "SELECT * FROM costing_audit_events WHERE brand_id=? AND location_id=? ORDER BY id DESC LIMIT 200",
        scopeValues(s),
      ),
    );
  }
  async renameLibrary(
    s: Scope,
    resource: string,
    recordId: string,
    input: Input,
  ) {
    return this.transaction(s, true, async (c) => {
      ensure(
        ["sizes", "option_groups", "options"].includes(resource),
        "Unknown library.",
      );
      const row = await get(c, resource, s, recordId);
      const field = resource === "sizes" ? "label" : "name";
      ensure(
        input.previousName === row[field],
        "This record changed. Reload before saving.",
        409,
      );
      await c.execute(
        `UPDATE costing_${resource} SET ${field}=? WHERE brand_id=? AND location_id=? AND id=?`,
        [text(input.name, 100), ...scopeValues(s), row.id],
      );
      await audit(c, s, resource, recordId, "RENAMED");
      return { id: recordId };
    });
  }
  async access(s: Scope, input: Input) {
    return this.transaction(s, true, async (c, permission) => {
      ensure(permission === "ADMIN", "Administrator access is required.", 403);
      const staffId = id(input.staffId);
      const [staff] = await rows(
        c,
        "SELECT id FROM staff_users WHERE id=? AND status='ACTIVE'",
        [staffId],
      );
      ensure(staff, "Staff account is unavailable.");
      const p = choice(input.permission, ["VIEWER", "EDITOR", "ADMIN"]);
      const [old] = await rows(
        c,
        "SELECT * FROM costing_staff_access WHERE brand_id=? AND location_id=? AND staff_user_id=?",
        [...scopeValues(s), staffId],
      );
      ensure(
        !old,
        "Access already exists; contact the costing administrator to review it.",
        409,
      );
      const resultId = await insert(c, "staff_access", s, {
        staff_user_id: staffId,
        permission: p,
      });
      await audit(c, s, "staff_access", resultId, "GRANTED");
      return { id: resultId };
    });
  }
}
