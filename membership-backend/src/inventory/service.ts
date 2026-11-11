import crypto from "node:crypto";
import { createPriceTemplate, type TemplateMaterial } from "./template.js";
import type { PoolConnection } from "mysql2/promise";
import { CostingService, type Scope } from "../costing/service.js";
import { Decimal } from "../costing/decimal.js";
import { convert, type Unit } from "../costing/calculator.js";
import {
  CostingError,
  ensure,
  id,
  text,
  decimal,
  choice,
  price,
  version,
} from "../costing/validation.js";
import {
  measure,
  bounded,
  stockInput,
  normalizeRow,
  dateOnly,
  todayNZ,
  type BaseUnit,
  type ImportRow,
  parseWorkbook,
} from "./parsing.js";
type Row = Record<string, any>;
type Input = Record<string, any>;
const sv = (s: Scope) => [s.brandId, s.locationId];
const hash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
// MySQL JSON storage reorders object keys. Preview tokens must survive round-trips.
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const previewToken = (payload: unknown) => hash(canonical(payload));
const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
async function rows(
  c: PoolConnection,
  sql: string,
  args: any[] = [],
): Promise<Row[]> {
  const [r] = await c.query(sql, args);
  return r as Row[];
}
const tables = new Set([
  "items",
  "item_specs",
  "balances",
  "movements",
  "imports",
]);
async function insert(c: PoolConnection, s: Scope, table: string, data: Input) {
  ensure(tables.has(table), "Invalid inventory resource.");
  const fields = ["brand_id", "location_id", ...Object.keys(data)];
  const [result]: any = await c.execute(
    `INSERT INTO inventory_${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
    [...sv(s), ...Object.values(data)],
  );
  return String(result.insertId);
}
async function get(
  c: PoolConnection,
  s: Scope,
  table: string,
  recordId: unknown,
) {
  ensure(tables.has(table), "Invalid inventory resource.");
  const [r] = await rows(
    c,
    `SELECT * FROM inventory_${table} WHERE brand_id=? AND location_id=? AND id=?`,
    [...sv(s), id(recordId)],
  );
  ensure(r, "Inventory record not found in this location.", 404);
  return r;
}
async function material(c: PoolConnection, s: Scope, materialId: unknown) {
  const [r] = await rows(
    c,
    "SELECT * FROM costing_materials WHERE brand_id=? AND location_id=? AND id=?",
    [...sv(s), id(materialId)],
  );
  ensure(r, "Material does not belong to this location.", 404);
  ensure(
    r.status === "ACTIVE" && ["RAW", "PACKAGING"].includes(r.kind),
    "Only active raw ingredients or packaging can be linked.",
  );
  return r;
}
async function audit(
  c: PoolConnection,
  s: Scope,
  entity: string,
  entityId: string,
  action: string,
  details: Input = {},
) {
  await c.execute(
    "INSERT INTO costing_audit_events (brand_id,location_id,entity_type,entity_id,action,details,created_by) VALUES (?,?,?,?,?,?,?)",
    [...sv(s), entity, entityId, action, JSON.stringify(details), s.staffId],
  );
}
async function balance(c: PoolConnection, s: Scope, itemId: string) {
  const [r] = await rows(
    c,
    "SELECT * FROM inventory_balances WHERE brand_id=? AND location_id=? AND item_id=?",
    [...sv(s), itemId],
  );
  return r ?? null;
}
async function currentSpec(c: PoolConnection, s: Scope, item: Row) {
  if (!item.current_spec_id) return null;
  const r = await get(c, s, "item_specs", item.current_spec_id);
  ensure(
    String(r.item_id) === String(item.id) && r.unit_code === item.base_unit,
    "Inventory specification ownership or unit is inconsistent.",
  );
  return r;
}
async function addSpec(
  c: PoolConnection,
  s: Scope,
  item: Row,
  spec: { quantity: string; unit: string; source: string },
) {
  ensure(
    spec.unit === item.base_unit,
    "A pack specification cannot change the stock dimension.",
  );
  const [[next]]: any = await c.query(
    "SELECT COALESCE(MAX(version),0)+1 AS n FROM inventory_item_specs WHERE brand_id=? AND location_id=? AND item_id=?",
    [...sv(s), item.id],
  );
  return insert(c, s, "item_specs", {
    item_id: item.id,
    version: next.n,
    quantity: spec.quantity,
    unit_code: spec.unit,
    source_text: spec.source,
    created_by: s.staffId,
  });
}
export class InventoryService {
  constructor(readonly costing: CostingService) {}
  async parse(s: Scope, buffer: Buffer) {
    return this.costing.transaction(s, false, async (_c, p) => {
      ensure(p !== "VIEWER", "Viewers cannot import inventory.", 403);
      return parseWorkbook(buffer);
    });
  }
  async downloadTemplate(s: Scope) {
    const materials = await this.costing.transaction(s, false, async (c) => {
      const records = await rows(
        c,
        `SELECT COALESCE(i.code,m.code) AS code,m.name,m.kind,
        sp.quantity AS spec_quantity,sp.unit_code AS spec_unit,sp.source_text AS spec_source,
        p.amount,p.usable_quantity,p.unit_code AS price_unit,p.tax_basis,p.gst_rate
        FROM costing_materials m
        LEFT JOIN inventory_items i ON i.material_id=m.id AND i.brand_id=m.brand_id AND i.location_id=m.location_id
        LEFT JOIN inventory_item_specs sp ON sp.id=i.current_spec_id AND sp.item_id=i.id AND sp.brand_id=i.brand_id AND sp.location_id=i.location_id
        LEFT JOIN costing_material_price_heads h ON h.material_id=m.id AND h.brand_id=m.brand_id AND h.location_id=m.location_id
        LEFT JOIN costing_material_prices p ON p.id=h.price_id AND p.material_id=m.id AND p.brand_id=m.brand_id AND p.location_id=m.location_id
        WHERE m.brand_id=? AND m.location_id=? AND m.status='ACTIVE' AND m.kind IN ('RAW','PACKAGING')
        AND (i.id IS NULL OR i.status='ACTIVE') ORDER BY COALESCE(i.code,m.code) LIMIT 1001`,
        sv(s),
      );
      ensure(
        records.length <= 1000,
        "The template supports up to 1,000 materials. Filter or split a larger catalog before exporting.",
      );
      return records as TemplateMaterial[];
    });
    return createPriceTemplate(materials);
  }
  async list(s: Scope) {
    return this.costing.transaction(s, false, async (c) => {
      const items = await rows(
        c,
        `SELECT i.*,m.name,m.kind,m.unit_code AS costing_unit,m.status AS material_status,b.quantity,b.row_version AS balance_version,sp.quantity AS pack_quantity,sp.unit_code AS pack_unit,sp.source_text,p.amount AS cost_price,p.usable_quantity AS price_quantity,p.unit_code AS price_unit,p.tax_basis AS price_tax_basis FROM inventory_items i JOIN costing_materials m ON m.id=i.material_id AND m.brand_id=i.brand_id AND m.location_id=i.location_id LEFT JOIN inventory_balances b ON b.item_id=i.id AND b.brand_id=i.brand_id AND b.location_id=i.location_id LEFT JOIN inventory_item_specs sp ON sp.id=i.current_spec_id AND sp.item_id=i.id AND sp.brand_id=i.brand_id AND sp.location_id=i.location_id LEFT JOIN costing_material_price_heads h ON h.material_id=m.id AND h.brand_id=m.brand_id AND h.location_id=m.location_id LEFT JOIN costing_material_prices p ON p.id=h.price_id AND p.material_id=m.id AND p.brand_id=m.brand_id AND p.location_id=m.location_id WHERE i.brand_id=? AND i.location_id=? ORDER BY i.status,m.name LIMIT 1000`,
        sv(s),
      );
      return items.map((i) => ({
        ...i,
        stock_status:
          i.quantity == null
            ? "UNKNOWN"
            : i.minimum_quantity != null &&
                Decimal.of(i.quantity).compare(
                  Decimal.of(i.minimum_quantity),
                ) <= 0
              ? "LOW"
              : "OK",
      }));
    });
  }
  async detail(s: Scope, itemId: string) {
    return this.costing.transaction(s, false, async (c) => {
      const item = await get(c, s, "items", itemId);
      const m = await rows(
        c,
        "SELECT id,name,code,kind,unit_code,status FROM costing_materials WHERE brand_id=? AND location_id=? AND id=?",
        [...sv(s), item.material_id],
      );
      ensure(m.length, "The linked material no longer exists.");
      return {
        item,
        material: m[0],
        balance: await balance(c, s, String(item.id)),
        spec: await currentSpec(c, s, item),
        specs: await rows(
          c,
          "SELECT * FROM inventory_item_specs WHERE brand_id=? AND location_id=? AND item_id=? ORDER BY version DESC",
          [...sv(s), item.id],
        ),
        movements: await rows(
          c,
          "SELECT * FROM inventory_movements WHERE brand_id=? AND location_id=? AND item_id=? ORDER BY id DESC LIMIT 200",
          [...sv(s), item.id],
        ),
      };
    });
  }
  async history(s: Scope) {
    return this.costing.transaction(s, false, (c) =>
      rows(
        c,
        `SELECT v.*,i.code,m.name FROM inventory_movements v JOIN inventory_items i ON i.id=v.item_id AND i.brand_id=v.brand_id AND i.location_id=v.location_id JOIN costing_materials m ON m.id=i.material_id AND m.brand_id=i.brand_id AND m.location_id=i.location_id WHERE v.brand_id=? AND v.location_id=? ORDER BY v.id DESC LIMIT 300`,
        sv(s),
      ),
    );
  }
  async create(s: Scope, input: Input) {
    return this.costing.transaction(s, true, async (c) => {
      const code = text(input.code, 50);
      ensure(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code), "Invalid code format.");
      const spec = input.packText ? measure(input.packText) : null;
      const base =
        spec?.unit ?? choice(input.baseUnit, ["g", "ml", "each"] as const);
      let m: Row;
      if (input.materialId) m = await material(c, s, input.materialId);
      else {
        const name = text(input.name);
        const kind = choice(input.kind, ["RAW", "PACKAGING"]);
        const [existing] = await rows(
          c,
          "SELECT id FROM costing_materials WHERE brand_id=? AND location_id=? AND (code=? OR name=?) LIMIT 1",
          [...sv(s), code, name],
        );
        ensure(
          !existing,
          "A material with this code or name exists. Link the existing material.",
          409,
        );
        const [r]: any = await c.execute(
          "INSERT INTO costing_materials (brand_id,location_id,code,name,kind,unit_code) VALUES (?,?,?,?,?,?)",
          [...sv(s), code, name, kind, base],
        );
        m = await material(c, s, String(r.insertId));
      }
      const [codeOwner] = await rows(
        c,
        "SELECT id FROM costing_materials WHERE brand_id=? AND location_id=? AND code=?",
        [...sv(s), code],
      );
      ensure(
        !codeOwner || String(codeOwner.id) === String(m.id),
        "This code belongs to another costing material.",
        409,
      );
      ensure(
        m.kind !== "PACKAGING" || base === "each",
        "Packaging stock must use individual counts.",
      );
      const minimum =
        input.minimumQuantity == null || input.minimumQuantity === ""
          ? null
          : bounded(Decimal.of(decimal(input.minimumQuantity)), base);
      const itemId = await insert(c, s, "items", {
        material_id: m.id,
        code,
        base_unit: base,
        minimum_quantity: minimum,
      });
      const item = await get(c, s, "items", itemId);
      if (spec) {
        const specId = await addSpec(c, s, item, spec);
        await c.execute(
          "UPDATE inventory_items SET current_spec_id=? WHERE brand_id=? AND location_id=? AND id=?",
          [specId, ...sv(s), itemId],
        );
      }
      await audit(c, s, "inventory_item", itemId, "INVENTORY_CREATED");
      return { id: itemId };
    });
  }
  async settings(s: Scope, itemId: string, input: Input) {
    return this.costing.transaction(s, true, async (c) => {
      const item = await get(c, s, "items", itemId);
      ensure(
        item.status === "ACTIVE",
        "Archived inventory items cannot be edited.",
      );
      await material(c, s, item.material_id);
      ensure(
        Number(item.row_version) === version(input.version),
        "Inventory details have changed. Refresh and try again.",
        409,
      );
      const minimum =
        input.minimumQuantity == null || input.minimumQuantity === ""
          ? null
          : bounded(Decimal.of(decimal(input.minimumQuantity)), item.base_unit);
      const old = await currentSpec(c, s, item);
      let specId = item.current_spec_id;
      if (input.packText) {
        const spec = measure(input.packText);
        if (
          !old ||
          spec.source !== old.source_text ||
          spec.quantity !== old.quantity
        )
          specId = await addSpec(c, s, item, spec);
      }
      await c.execute(
        "UPDATE inventory_items SET minimum_quantity=?,current_spec_id=?,row_version=row_version+1 WHERE brand_id=? AND location_id=? AND id=?",
        [minimum, specId ?? null, ...sv(s), item.id],
      );
      await audit(
        c,
        s,
        "inventory_item",
        String(item.id),
        "INVENTORY_SETTINGS_UPDATED",
      );
      return { id: String(item.id) };
    });
  }
  async archive(s: Scope, itemId: string, input: Input) {
    return this.costing.transaction(s, true, async (c) => {
      const item = await get(c, s, "items", itemId);
      ensure(
        Number(item.row_version) === version(input.version),
        "Inventory details have changed. Refresh and try again.",
        409,
      );
      const b = await balance(c, s, itemId);
      ensure(
        !b || Decimal.of(b.quantity).compare(Decimal.of("0")) === 0,
        "An item with remaining stock cannot be archived.",
        409,
      );
      const d = await this.costing.dependencies(c, s, String(item.material_id));
      ensure(
        !d.preparations.length && !d.recipes.length,
        "This item is used by an active recipe or prepared ingredient and cannot be archived.",
        409,
      );
      await c.execute(
        "UPDATE inventory_items SET status='ARCHIVED',row_version=row_version+1 WHERE brand_id=? AND location_id=? AND id=?",
        [...sv(s), item.id],
      );
      await audit(c, s, "inventory_item", itemId, "INVENTORY_ARCHIVED");
      return { id: itemId };
    });
  }
  private async applyMovement(
    c: PoolConnection,
    s: Scope,
    item: Row,
    input: Input,
  ) {
    const action = choice(input.action, [
      "RECEIPT",
      "ISSUE",
      "WASTE",
      "COUNT",
      "REVERSAL",
    ]);
    const observed = dateOnly(input.date ?? todayNZ());
    ensure(observed <= todayNZ(), "The movement date cannot be in the future.");
    const reason = text(input.reason, 500);
    const requestId = text(input.requestId, 100);
    const requestHash = hash({
      itemId: String(item.id),
      action,
      date: observed,
      reason,
      quantity: input.quantity == null ? null : decimal(input.quantity),
      unit: input.unit ?? null,
      packCount: input.packCount == null ? null : decimal(input.packCount),
      specId: input.specId ?? null,
      reversalId: input.reversalId ?? null,
    });
    const [previous] = await rows(
      c,
      "SELECT * FROM inventory_movements WHERE brand_id=? AND location_id=? AND request_id=?",
      [...sv(s), requestId],
    );
    if (previous) {
      ensure(
        previous.request_hash === requestHash,
        "A request ID cannot be reused for a different operation.",
        409,
      );
      return { ...previous, duplicate: true };
    }
    ensure(item.status === "ACTIVE", "This inventory item is archived.");
    await material(c, s, item.material_id);
    const b = await balance(c, s, String(item.id));
    ensure(
      b
        ? input.version != null &&
            Number(b.row_version) === version(input.version)
        : input.version == null,
      "The stock balance has changed. Refresh and try again.",
      409,
    );
    const [latest] = await rows(
      c,
      "SELECT observed_date FROM inventory_movements WHERE brand_id=? AND location_id=? AND item_id=? ORDER BY id DESC LIMIT 1",
      [...sv(s), item.id],
    );
    ensure(
      !latest || observed >= latest.observed_date,
      "The movement date precedes the latest stock movement. Check the date before recording.",
      409,
    );
    let delta: Decimal, quantity: Decimal;
    let reversalOf: string | null = null;
    if (action === "REVERSAL") {
      const original = await get(c, s, "movements", input.reversalId);
      ensure(
        String(original.item_id) === String(item.id) &&
          ["RECEIPT", "ISSUE", "WASTE"].includes(original.action),
        "Only a receipt, issue or waste movement for this item can be reversed.",
      );
      const [reversed] = await rows(
        c,
        "SELECT id FROM inventory_movements WHERE brand_id=? AND location_id=? AND reversal_of=?",
        [...sv(s), original.id],
      );
      ensure(!reversed, "This movement has already been reversed.", 409);
      ensure(b, "An opening stock count is required.");
      delta = Decimal.of("0").sub(Decimal.of(original.quantity_delta));
      quantity = Decimal.of(b.quantity).add(delta);
      reversalOf = String(original.id);
    } else {
      let amount: Decimal;
      if (input.packCount != null) {
        ensure(
          input.quantity == null,
          "Provide either pack count or base-unit quantity, not both.",
        );
        const spec = await currentSpec(c, s, item);
        ensure(
          spec && String(input.specId) === String(spec.id),
          "The pack specification has changed. Refresh and try again.",
          409,
        );
        amount = Decimal.of(decimal(input.packCount, action !== "COUNT")).mul(
          Decimal.of(spec.quantity),
        );
      } else {
        const u = choice(input.unit, ["g", "kg", "ml", "l", "each", "dozen"]);
        try {
          amount = convert(
            decimal(input.quantity, action !== "COUNT"),
            u,
            item.base_unit,
          );
        } catch (error) {
          if (error instanceof CostingError) throw error;
          throw new CostingError(
            422,
            "Incompatible units. Convert kg to g or L to ml within the same dimension only.",
          );
        }
      }
      bounded(amount, item.base_unit);
      if (action === "COUNT") {
        quantity = amount;
        delta = quantity.sub(Decimal.of(b?.quantity ?? "0"));
      } else {
        ensure(
          b,
          "Record an opening stock count (including an explicit zero) before stock movements.",
          409,
        );
        delta = action === "RECEIPT" ? amount : Decimal.of("0").sub(amount);
        quantity = Decimal.of(b.quantity).add(delta);
      }
    }
    ensure(
      quantity.compare(Decimal.of("0")) >= 0,
      "Insufficient stock. Negative balances are not allowed.",
      409,
    );
    const after = bounded(quantity, item.base_unit);
    const change = delta.toFixed(8);
    ensure(
      /^-?\d{1,12}(\.\d{1,8})?$/.test(change),
      "The stock change exceeds the allowed range.",
    );
    if (b)
      await c.execute(
        "UPDATE inventory_balances SET quantity=?,row_version=row_version+1 WHERE brand_id=? AND location_id=? AND id=?",
        [after, ...sv(s), b.id],
      );
    else await insert(c, s, "balances", { item_id: item.id, quantity: after });
    const movementId = await insert(c, s, "movements", {
      item_id: item.id,
      action: !b ? "OPENING" : action,
      quantity_delta: change,
      quantity_before: b?.quantity ?? null,
      quantity_after: after,
      unit_code: item.base_unit,
      observed_date: observed,
      reason,
      request_id: requestId,
      request_hash: requestHash,
      reversal_of: reversalOf,
      created_by: s.staffId,
    });
    await audit(
      c,
      s,
      "inventory_item",
      String(item.id),
      "STOCK_" + (!b ? "OPENING" : action),
      { movementId },
    );
    return { ...(await get(c, s, "movements", movementId)), duplicate: false };
  }
  async move(s: Scope, itemId: string, input: Input) {
    return this.costing.transaction(s, true, async (c) =>
      this.applyMovement(c, s, await get(c, s, "items", itemId), input),
    );
  }
  private async plan(
    c: PoolConnection,
    s: Scope,
    row: ImportRow,
    mapping: unknown,
    syncPrices: boolean,
    mode: "STOCKTAKE" | "RECEIPT" = "STOCKTAKE",
    tax?: { taxBasis: string; gstRate: string },
  ): Promise<Row> {
    const data = stockInput(row);
    if (!data.stock && (row.amount === "" || !syncPrices)) {
      const [unchanged] = await rows(
        c,
        "SELECT i.base_unit,b.quantity FROM inventory_items i LEFT JOIN inventory_balances b ON b.item_id=i.id AND b.brand_id=i.brand_id AND b.location_id=i.location_id WHERE i.brand_id=? AND i.location_id=? AND i.code=?",
        [...sv(s), row.code],
      );
      return {
        row: row.row,
        code: row.code,
        name: row.name,
        kind: row.kind,
        status: "SKIP",
        message: "No stock quantity or enabled price update. No changes.",
        warnings: [],
        candidates: [],
        currentStock: unchanged?.quantity ?? null,
        resultingStock: unchanged?.quantity ?? null,
        baseUnit: unchanged?.base_unit,
        changesStock: false,
        changesPrice: false,
      };
    }
    const [item] = await rows(
      c,
      "SELECT * FROM inventory_items WHERE brand_id=? AND location_id=? AND code=?",
      [...sv(s), row.code],
    );
    let m: Row | undefined;
    if (item) {
      ensure(item.status === "ACTIVE", "This inventory code is archived.", 409);
      m = await material(c, s, item.material_id);
      ensure(
        mapping == null || mapping === "" || String(mapping) === String(m.id),
        "An existing inventory material link cannot be replaced.",
        409,
      );
    } else if (mapping && mapping !== "new") m = await material(c, s, mapping);
    else if (mapping !== "new") {
      [m] = await rows(
        c,
        "SELECT * FROM costing_materials WHERE brand_id=? AND location_id=? AND code=?",
        [...sv(s), row.code],
      );
    }
    if (m) {
      const [owner] = await rows(
        c,
        "SELECT id FROM costing_materials WHERE brand_id=? AND location_id=? AND code=?",
        [...sv(s), row.code],
      );
      ensure(
        !owner || String(owner.id) === String(m.id),
        "This code belongs to another costing material.",
        409,
      );
      ensure(
        m.status === "ACTIVE" && m.kind === row.kind,
        "The existing material type or status conflicts with the uploaded row.",
        409,
      );
      ensure(
        m.name === row.name || String(mapping) === String(m.id),
        "The code matches a different name. Explicitly select the existing material to link.",
        409,
      );
    }
    const candidates = await rows(
      c,
      "SELECT id,name,code,kind,unit_code FROM costing_materials WHERE brand_id=? AND location_id=? AND name=? AND status='ACTIVE' AND kind=?",
      [...sv(s), row.name, row.kind],
    );
    if (!m && mapping !== "new" && candidates.length)
      return {
        row: row.row,
        code: row.code,
        name: row.name,
        kind: row.kind,
        status: "ERROR",
        message:
          "A material with this name exists. Confirm the link to avoid duplicates.",
        candidates,
        warnings: [],
      };
    if (!m) {
      const [collision] = await rows(
        c,
        "SELECT id FROM costing_materials WHERE brand_id=? AND location_id=? AND code=?",
        [...sv(s), row.code],
      );
      ensure(!collision, "This code exists. Link the existing material.", 409);
    }
    const derived =
      data.stock?.unit ??
      data.spec?.unit ??
      item?.base_unit ??
      (row.kind === "PACKAGING"
        ? "each"
        : m
          ? ["g", "kg"].includes(m.unit_code)
            ? "g"
            : ["ml", "l"].includes(m.unit_code)
              ? "ml"
              : "each"
          : null);
    ensure(
      derived,
      "Add a pack specification with a unit before creating this inventory item.",
    );
    ensure(
      row.kind !== "PACKAGING" || derived === "each",
      "Packaging stock must use individual counts.",
    );
    const base = item?.base_unit ?? derived;
    ensure(
      base === derived,
      "The uploaded unit changes the stock dimension. Check the row.",
      409,
    );
    if (m && !item) {
      const [already] = await rows(
        c,
        "SELECT code FROM inventory_items WHERE brand_id=? AND location_id=? AND material_id=?",
        [...sv(s), m.id],
      );
      ensure(
        !already,
        "This material already has an inventory code. Use the existing code.",
        409,
      );
    }
    const b = item ? await balance(c, s, String(item.id)) : null;
    const oldSpec = item ? await currentSpec(c, s, item) : null;
    const spec =
      data.spec ??
      (oldSpec
        ? {
            quantity: oldSpec.quantity,
            unit: oldSpec.unit_code,
            source: oldSpec.source_text,
          }
        : null);
    if (item && data.stock) {
      const [latest] = await rows(
        c,
        "SELECT observed_date FROM inventory_movements WHERE brand_id=? AND location_id=? AND item_id=? ORDER BY id DESC LIMIT 1",
        [...sv(s), item.id],
      );
      ensure(
        !latest || data.date! >= latest.observed_date,
        "The count date precedes existing movements and cannot overwrite newer stock.",
        409,
      );
    }
    const importedPositive =
      data.stock &&
      Decimal.of(data.stock.quantity).compare(Decimal.of("0")) > 0;
    if (mode === "RECEIPT" && importedPositive)
      ensure(
        b,
        "Record an opening stocktake (including an explicit zero) before importing receipts for this material.",
        409,
      );
    const changesStock = Boolean(
      data.stock && (mode === "STOCKTAKE" || importedPositive),
    );
    const resultingStock = changesStock
      ? bounded(
          mode === "RECEIPT"
            ? Decimal.of(b!.quantity).add(Decimal.of(data.stock!.quantity))
            : Decimal.of(data.stock!.quantity),
          base,
        )
      : (b?.quantity ?? null);
    const [head] = m
      ? await rows(
          c,
          "SELECT * FROM costing_material_price_heads WHERE brand_id=? AND location_id=? AND material_id=?",
          [...sv(s), m.id],
        )
      : [];
    const [oldPrice] = head
      ? await rows(
          c,
          "SELECT * FROM costing_material_prices WHERE brand_id=? AND location_id=? AND material_id=? AND id=?",
          [...sv(s), m!.id, head.price_id],
        )
      : [];
    const warnings: string[] = [];
    let canSync = syncPrices && row.amount !== "" && !!spec;
    if (!data.stock)
      warnings.push("No quantity provided. Stock will remain unchanged.");
    if (row.amount === "")
      warnings.push("Price is unknown. No zero-cost price will be created.");
    if (row.amount !== "" && !spec)
      warnings.push(
        "Price is entered but pack contents are unknown. Cost synchronization is deferred.",
      );
    if (canSync && m) {
      try {
        convert(spec!.quantity, spec!.unit as Unit, m.unit_code);
      } catch {
        canSync = false;
        warnings.push(
          "Stock and recipe units differ between mass and volume. Price synchronization is deferred; kg to ml conversion is not supported.",
        );
      }
    }
    ensure(
      !(syncPrices && row.amount !== "" && !canSync),
      "The entered price cannot be synchronized without compatible pack contents. Correct the specification or turn off price synchronization.",
      422,
    );
    const changesPrice = Boolean(
      canSync &&
      (!oldPrice ||
        Decimal.of(oldPrice.amount).compare(Decimal.of(row.amount)) !== 0 ||
        oldPrice.unit_code !== spec!.unit ||
        Decimal.of(oldPrice.usable_quantity).compare(
          Decimal.of(spec!.quantity),
        ) !== 0 ||
        (tax &&
          (oldPrice.tax_basis !== tax.taxBasis ||
            Decimal.of(oldPrice.gst_rate).compare(Decimal.of(tax.gstRate)) !==
              0))),
    );
    const stateHash = hash({
      item: item ?? null,
      balance: b,
      spec: oldSpec,
      material: m ?? null,
      priceHead: syncPrices ? (head ?? null) : null,
    });
    return {
      row: row.row,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: changesStock || changesPrice ? "READY" : "SKIP",
      currentStock: b?.quantity ?? null,
      resultingStock,
      changesStock,
      changesPrice,
      currentPrice: oldPrice
        ? {
            amount: oldPrice.amount,
            quantity: oldPrice.usable_quantity,
            unit: oldPrice.unit_code,
            taxBasis: oldPrice.tax_basis,
            gstRate: oldPrice.gst_rate,
          }
        : null,
      nextPrice: canSync
        ? {
            amount: row.amount,
            quantity: spec!.quantity,
            unit: spec!.unit,
            taxBasis: tax?.taxBasis,
            gstRate: tax?.gstRate,
          }
        : null,
      message:
        !changesStock && !changesPrice
          ? "No stock or price changes."
          : item
            ? mode === "RECEIPT"
              ? "Add received stock and preserve the material link"
              : "Set actual counted stock and preserve the material link"
            : m
              ? "Link existing costing material"
              : "Create shared material",
      materialId: m ? String(m.id) : null,
      materialName: m?.name ?? null,
      itemId: item ? String(item.id) : null,
      baseUnit: base,
      stock: data.stock,
      observedDate: data.date,
      spec,
      hasNewSpec: !!data.spec,
      amount: row.amount,
      canSyncPrice: canSync,
      warnings,
      candidates,
      stateHash,
    };
  }
  async preview(s: Scope, input: Input) {
    return this.costing.transaction(s, true, async (c) => {
      ensure(
        Array.isArray(input.rows) &&
          input.rows.length > 0 &&
          input.rows.length <= 1000,
        "Choose a workbook containing 1–1,000 data rows.",
      );
      const sourceRows: ImportRow[] = input.rows.map((r: Input, i: number) => {
        ensure(r && typeof r === "object", "Invalid data row.");
        return normalizeRow(r, Number.isInteger(r.row) ? r.row : i + 2);
      });
      ensure(
        new Set(sourceRows.map((r) => r.code.toUpperCase())).size ===
          sourceRows.length,
        "The file contains duplicate codes.",
      );
      const tax = price({
        amount: "0",
        taxBasis: input.taxBasis,
        gstRate: input.gstRate,
      });
      const mode = choice(input.mode ?? "STOCKTAKE", [
        "STOCKTAKE",
        "RECEIPT",
      ] as const);
      const batchId =
        mode === "RECEIPT" ? text(input.batchId, 80).toUpperCase() : null;
      if (batchId)
        ensure(
          /^[A-Z0-9][A-Z0-9._/-]*$/.test(batchId),
          "Use letters, numbers, hyphens, slashes, dots or underscores for the receipt batch reference.",
        );
      const cfg = {
        mode,
        batchId,
        taxBasis: tax.taxBasis,
        gstRate: tax.gstRate,
        syncPrices: input.syncPrices !== false,
      };
      const mappings =
        input.mappings &&
        typeof input.mappings === "object" &&
        !Array.isArray(input.mappings)
          ? input.mappings
          : {};
      const excluded: Array<string> = Array.isArray(input.excludedCodes)
        ? input.excludedCodes.map((x: unknown) => text(x, 50))
        : [];
      const fingerprint = hash({
        rows: sourceRows
          .map(({ row, ...r }) => r)
          .sort((a, b) => a.code.localeCompare(b.code)),
        cfg:
          mode === "STOCKTAKE"
            ? {
                taxBasis: cfg.taxBasis,
                gstRate: cfg.gstRate,
                syncPrices: cfg.syncPrices,
              }
            : cfg,
        mappings: Object.entries(mappings).sort(),
        excluded: [...excluded].sort(),
      });
      const contentHash =
        mode === "RECEIPT"
          ? hash({ type: "RECEIPT_BATCH", batchId })
          : fingerprint;
      const [existing] = await rows(
        c,
        "SELECT * FROM inventory_imports WHERE brand_id=? AND location_id=? AND content_hash=?",
        [...sv(s), contentHash],
      );
      if (existing?.status === "COMPLETED") {
        if (mode === "RECEIPT")
          ensure(
            json(existing.payload).fingerprint === fingerprint,
            "This receipt batch has already been posted with different data or settings. It cannot be posted again.",
            409,
          );
        ensure(
          String(existing.created_by) === String(s.staffId),
          "This import belongs to another staff member.",
          403,
        );
        return {
          id: String(existing.id),
          mode,
          batchId,
          previewToken: previewToken(json(existing.payload)),
          completed: true,
          result: json(existing.result),
          plans: json(existing.payload).plans,
        };
      }
      const plans: Row[] = [];
      for (const row of sourceRows) {
        if (excluded.includes(row.code)) {
          plans.push({
            row: row.row,
            code: row.code,
            name: row.name,
            kind: row.kind,
            status: "SKIP",
            message: "Explicitly skipped for this import.",
            warnings: [],
            candidates: [],
          });
          continue;
        }
        try {
          plans.push(
            await this.plan(
              c,
              s,
              row,
              Object.hasOwn(mappings, row.code)
                ? mappings[row.code]
                : undefined,
              cfg.syncPrices,
              cfg.mode,
              cfg,
            ),
          );
        } catch (error) {
          plans.push({
            row: row.row,
            code: row.code,
            name: row.name,
            kind: row.kind,
            status: "ERROR",
            message:
              error instanceof CostingError
                ? error.message
                : "Invalid data format.",
            warnings: [],
            candidates: [],
          });
        }
      }
      const used = new Set<string>();
      for (const plan of plans.filter(
        (p) => p.status === "READY" && p.materialId,
      )) {
        if (used.has(plan.materialId)) {
          plan.status = "ERROR";
          plan.message =
            "One costing material cannot be linked to two inventory codes.";
        }
        used.add(plan.materialId);
      }
      const payload = {
        sourceRows,
        cfg,
        mappings,
        excluded,
        plans,
        fingerprint,
      };
      let previewId: string;
      if (existing) {
        ensure(
          String(existing.created_by) === String(s.staffId),
          "This import belongs to another staff member.",
          403,
        );
        await c.execute(
          "UPDATE inventory_imports SET payload=? WHERE brand_id=? AND location_id=? AND id=?",
          [JSON.stringify(payload), ...sv(s), existing.id],
        );
        previewId = String(existing.id);
      } else
        previewId = await insert(c, s, "imports", {
          content_hash: contentHash,
          payload: JSON.stringify(payload),
          created_by: s.staffId,
        });
      return {
        id: previewId,
        mode,
        batchId,
        previewToken: previewToken(payload),
        completed: false,
        plans,
        summary: {
          ready: plans.filter((p) => p.status === "READY").length,
          skipped: plans.filter((p) => p.status === "SKIP").length,
          errors: plans.filter((p) => p.status === "ERROR").length,
          stockCounts: plans.filter(
            (p) => p.status === "READY" && p.changesStock,
          ).length,
          prices: plans.filter((p) => p.status === "READY" && p.changesPrice)
            .length,
        },
      };
    });
  }
  async confirm(s: Scope, previewId: string, input: Input = {}) {
    return this.costing.transaction(s, true, async (c) => {
      const record = await get(c, s, "imports", previewId);
      ensure(
        String(record.created_by) === String(s.staffId),
        "This import belongs to another staff member.",
        403,
      );
      if (record.status === "COMPLETED")
        return { ...json(record.result), duplicate: true };
      const payload = json(record.payload);
      const mode = payload.cfg.mode ?? "STOCKTAKE";
      if (mode === "RECEIPT" || input.previewToken != null)
        ensure(
          input.previewToken === previewToken(payload),
          "This preview has changed. Refresh it before confirming.",
          409,
        );
      ensure(
        !payload.plans.some((p: Row) => p.status === "ERROR"),
        "Resolve preview errors or explicitly skip the affected rows first.",
        409,
      );
      const ready: Row[] = payload.plans.filter(
        (p: Row) => p.status === "READY",
      );
      ensure(ready.length > 0, "No rows are ready to import.");
      for (const plan of ready) {
        const row = payload.sourceRows.find(
          (r: ImportRow) => r.code === plan.code,
        );
        const fresh = await this.plan(
          c,
          s,
          row,
          Object.hasOwn(payload.mappings, plan.code)
            ? payload.mappings[plan.code]
            : undefined,
          payload.cfg.syncPrices,
          mode,
          payload.cfg,
        );
        ensure(
          fresh.status === "READY" && fresh.stateHash === plan.stateHash,
          "Stock or costing data has changed since the preview. Refresh the preview.",
          409,
        );
      }
      const result = {
        itemsCreated: 0,
        linkedMaterials: 0,
        stockCounts: 0,
        prices: 0,
        pricesDeferred: 0,
        skipped: payload.plans.filter((p: Row) => p.status === "SKIP").length,
        importId: String(record.id),
        mode,
        batchId: payload.cfg.batchId ?? null,
      };
      for (const plan of ready) {
        let m: Row;
        if (plan.materialId) {
          m = await material(c, s, plan.materialId);
          result.linkedMaterials++;
        } else {
          const [created]: any = await c.execute(
            "INSERT INTO costing_materials (brand_id,location_id,code,name,kind,unit_code) VALUES (?,?,?,?,?,?)",
            [...sv(s), plan.code, plan.name, plan.kind, plan.baseUnit],
          );
          m = await material(c, s, String(created.insertId));
        }
        let item: Row;
        if (plan.itemId) item = await get(c, s, "items", plan.itemId);
        else {
          const itemId = await insert(c, s, "items", {
            material_id: m.id,
            code: plan.code,
            base_unit: plan.baseUnit,
          });
          item = await get(c, s, "items", itemId);
          result.itemsCreated++;
        }
        let spec = await currentSpec(c, s, item);
        if (
          plan.hasNewSpec &&
          (!spec ||
            plan.spec.quantity !== spec.quantity ||
            plan.spec.source !== spec.source_text)
        ) {
          const specId = await addSpec(c, s, item, plan.spec);
          await c.execute(
            "UPDATE inventory_items SET current_spec_id=?,row_version=row_version+1 WHERE brand_id=? AND location_id=? AND id=?",
            [specId, ...sv(s), item.id],
          );
          item = await get(c, s, "items", item.id);
          spec = await currentSpec(c, s, item);
        }
        if (plan.stock && (plan.changesStock ?? true)) {
          const b = await balance(c, s, String(item.id));
          await this.applyMovement(c, s, item, {
            action: mode === "RECEIPT" ? "RECEIPT" : "COUNT",
            quantity: plan.stock.quantity,
            unit: plan.stock.unit,
            date: plan.observedDate,
            reason:
              mode === "RECEIPT"
                ? `Excel receipt batch ${payload.cfg.batchId} (import #${record.id})`
                : `Excel stocktake import #${record.id}`,
            requestId: `import:${record.id}:${plan.code}`,
            version: b ? Number(b.row_version) : null,
          });
          result.stockCounts++;
        }
        if (plan.canSyncPrice) {
          ensure(
            spec,
            "A pack specification is required to synchronize prices.",
          );
          const [head] = await rows(
            c,
            "SELECT * FROM costing_material_price_heads WHERE brand_id=? AND location_id=? AND material_id=?",
            [...sv(s), m.id],
          );
          const [old] = head
            ? await rows(
                c,
                "SELECT * FROM costing_material_prices WHERE brand_id=? AND location_id=? AND material_id=? AND id=?",
                [...sv(s), m.id, head.price_id],
              )
            : [];
          if (
            !old ||
            Decimal.of(old.amount).compare(Decimal.of(plan.amount)) !== 0 ||
            old.unit_code !== spec.unit_code ||
            Decimal.of(old.usable_quantity).compare(
              Decimal.of(spec.quantity),
            ) !== 0 ||
            old.tax_basis !== payload.cfg.taxBasis ||
            Decimal.of(old.gst_rate).compare(
              Decimal.of(payload.cfg.gstRate),
            ) !== 0
          ) {
            await this.costing.addPriceWithinTransaction(c, s, String(m.id), {
              amount: plan.amount,
              quantity: spec.quantity,
              unit: spec.unit_code,
              inventorySpecId: String(spec.id),
              taxBasis: payload.cfg.taxBasis,
              gstRate: payload.cfg.gstRate,
              version: head ? Number(head.row_version) : undefined,
              notes: `Inventory Excel ${mode.toLowerCase()} import #${record.id}${payload.cfg.batchId ? ` / batch ${payload.cfg.batchId}` : ""} (source price basis confirmed)`,
            });
            result.prices++;
          }
        } else if (plan.amount !== "" && payload.cfg.syncPrices)
          result.pricesDeferred++;
      }
      await c.execute(
        "UPDATE inventory_imports SET status='COMPLETED',result=?,completed_at=NOW(6) WHERE brand_id=? AND location_id=? AND id=?",
        [JSON.stringify(result), ...sv(s), record.id],
      );
      await audit(
        c,
        s,
        "inventory_import",
        String(record.id),
        "INVENTORY_IMPORT_COMPLETED",
        result,
      );
      return result;
    });
  }
}
