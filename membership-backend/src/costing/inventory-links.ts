import type { PoolConnection } from "mysql2/promise";
import type { Scope } from "./service.js";
import { ensure } from "./validation.js";
import { convert, type Unit } from "./calculator.js";
export async function inventoryAvailable(c: PoolConnection) {
  const [r]: any = await c.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory_items'",
  );
  return r.length > 0;
}
export async function inventorySpec(
  c: PoolConnection,
  s: Scope,
  material: any,
) {
  if (!(await inventoryAvailable(c))) return null;
  const [[item]]: any = await c.query(
    "SELECT * FROM inventory_items WHERE brand_id=? AND location_id=? AND material_id=? AND status='ACTIVE'",
    [s.brandId, s.locationId, material.id],
  );
  if (!item || !item.current_spec_id) return null;
  const [[spec]]: any = await c.query(
    "SELECT * FROM inventory_item_specs WHERE brand_id=? AND location_id=? AND item_id=? AND id=?",
    [s.brandId, s.locationId, item.id, item.current_spec_id],
  );
  ensure(
    spec && spec.unit_code === item.base_unit,
    "Invalid inventory specification ownership or unit. Check the inventory item.",
  );
  let compatible = true;
  try {
    convert(spec.quantity, spec.unit_code as Unit, material.unit_code as Unit);
  } catch {
    compatible = false;
  }
  return {
    id: String(spec.id),
    itemId: String(item.id),
    quantity: String(spec.quantity),
    unit: spec.unit_code,
    sourceText: spec.source_text,
    compatible,
  };
}
export async function ensureNoActiveInventory(
  c: PoolConnection,
  s: Scope,
  materialId: string,
) {
  if (!(await inventoryAvailable(c))) return;
  const [items]: any = await c.query(
    "SELECT id FROM inventory_items WHERE brand_id=? AND location_id=? AND material_id=? AND status='ACTIVE' LIMIT 1",
    [s.brandId, s.locationId, materialId],
  );
  ensure(
    items.length === 0,
    "Archive the linked inventory item before archiving this costing material.",
    409,
  );
}
