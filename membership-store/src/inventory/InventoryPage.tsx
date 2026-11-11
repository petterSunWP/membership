import { useCallback, useEffect, useRef, useState } from "react";
import {
  costingRequest,
  decimalDisplay,
  errorMessage,
  money,
} from "../costing/api";
import { ErrorBox, Field } from "../costing/components";
import {
  inventoryRequest,
  unitLabel,
  type Item,
  type Location,
  type Material,
  type Movement,
} from "./api";
import {
  ItemSetup,
  StockOperation,
  ItemHistory,
  MovementTable,
} from "./ItemForms";
import { ImportPanel } from "./ImportPanel";
import "../costing/costing.css";
import "./inventory.css";
export default function InventoryPage() {
  const [locations, setLocations] = useState<Location[]>([]),
    [selected, setSelected] = useState(
      localStorage.getItem("costing_location") ?? "",
    ),
    [items, setItems] = useState<Item[]>([]),
    [materials, setMaterials] = useState<Material[]>([]),
    [movements, setMovements] = useState<Movement[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("items"),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [dialog, setDialog] = useState<{
      type: string;
      item?: Item;
      reversal?: Movement;
    } | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const location = locations.find(
      (l) => `${l.brandId}:${l.locationId}` === selected,
    ),
    base = location
      ? `/brands/${location.brandId}/locations/${location.locationId}`
      : "",
    canEdit = !!location && location.permission !== "VIEWER";
  useEffect(() => {
    void inventoryRequest<{ locations: Location[] }>("/context")
      .then((c) => {
        setLocations(c.locations);
        setSelected((v) =>
          c.locations.some((l) => `${l.brandId}:${l.locationId}` === v)
            ? v
            : c.locations[0]
              ? `${c.locations[0].brandId}:${c.locations[0].locationId}`
              : "",
        );
        if (!c.locations.length) setLoading(false);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
  }, []);
  const refresh = useCallback(async () => {
    if (!base) return;
    const g = ++generation.current;
    const [i, m, h] = await Promise.all([
      inventoryRequest<Item[]>(`${base}/items`),
      costingRequest<Material[]>(`${base}/materials`),
      inventoryRequest<Movement[]>(`${base}/movements`),
    ]);
    if (g === generation.current) {
      setItems(i);
      setMaterials(m);
      setMovements(h);
      setError("");
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    void refresh()
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      invalidate();
    };
  }, [refresh, invalidate]);
  const active = items.filter((i) => i.status === "ACTIVE"),
    shown = active.filter(
      (i) =>
        (!kind || i.kind === kind) &&
        `${i.code} ${i.name}`.toLowerCase().includes(search.toLowerCase()),
    );
  async function archive(i: Item) {
    try {
      await inventoryRequest(`${base}/items/${i.id}/archive`, "POST", {
        version: i.row_version,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="costing-app">
      <header className="costing-page-header">
        <div>
          <span className="costing-eyebrow">TEA TALK · INVENTORY</span>
          <h1>Ingredient & Packaging Inventory</h1>
          <p>Manual stock movements, stocktakes and linked recipe costs</p>
        </div>
        {locations.length > 0 && (
          <Field label="Brand / location">
            <select
              value={selected}
              onChange={(e) => {
                setDialog(null);
                setLoading(true);
                setSelected(e.target.value);
                localStorage.setItem("costing_location", e.target.value);
              }}
            >
              {locations.map((l) => (
                <option
                  key={l.locationId}
                  value={`${l.brandId}:${l.locationId}`}
                >
                  {l.brandName} / {l.locationName}
                </option>
              ))}
            </select>
          </Field>
        )}
      </header>
      <ErrorBox message={error} />
      {!loading && !locations.length && (
        <p>
          This account has not been assigned costing or inventory access for
          this location.
        </p>
      )}
      {location && (
        <>
          <nav className="costing-tabs">
            <button
              className={tab === "items" ? "active" : ""}
              onClick={() => setTab("items")}
            >
              Inventory
            </button>
            {canEdit && (
              <button
                className={tab === "import" ? "active" : ""}
                onClick={() => setTab("import")}
              >
                Excel import
              </button>
            )}
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Stock movements
            </button>
            <button
              onClick={() =>
                void refresh().catch((e) => setError(errorMessage(e)))
              }
            >
              Refresh
            </button>
          </nav>
          {loading ? (
            <p>Loading inventory…</p>
          ) : (
            <div key={base}>
              {tab === "items" && (
                <>
                  <div className="costing-metrics costing-card">
                    <div>
                      <span>Active items</span>
                      <strong>{active.length}</strong>
                    </div>
                    <div>
                      <span>Not counted</span>
                      <strong>
                        {
                          active.filter((i) => i.stock_status === "UNKNOWN")
                            .length
                        }
                      </strong>
                    </div>
                    <div>
                      <span>Low stock</span>
                      <strong>
                        {active.filter((i) => i.stock_status === "LOW").length}
                      </strong>
                    </div>
                  </div>
                  <section className="costing-card">
                    <div className="costing-form-grid">
                      <Field label="Search name or code">
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </Field>
                      <Field label="Type">
                        <select
                          value={kind}
                          onChange={(e) => setKind(e.target.value)}
                        >
                          <option value="">All</option>
                          <option value="RAW">Raw ingredient</option>
                          <option value="PACKAGING">Packaging</option>
                        </select>
                      </Field>
                    </div>
                    {canEdit && (
                      <button onClick={() => setDialog({ type: "setup" })}>
                        Add / link material
                      </button>
                    )}
                    <InventoryTable
                      items={shown}
                      canEdit={canEdit}
                      onAction={(type, item) => setDialog({ type, item })}
                    />
                    {!shown.length && (
                      <p>
                        No inventory items yet. Import the reviewed Excel file
                        or link existing costing materials.
                      </p>
                    )}
                  </section>
                </>
              )}
              {tab === "import" && canEdit && (
                <ImportPanel
                  base={base}
                  materials={materials}
                  saved={refresh}
                />
              )}{" "}
              {tab === "history" && (
                <section className="costing-card">
                  <h2>Latest 300 stock movements</h2>
                  <MovementTable
                    movements={movements}
                    onReverse={
                      canEdit
                        ? (m) => {
                            const item = items.find((i) => i.id === m.item_id);
                            if (item)
                              setDialog({ type: "stock", item, reversal: m });
                          }
                        : undefined
                    }
                  />
                </section>
              )}
            </div>
          )}
          {dialog && canEdit && dialog.type === "setup" && (
            <ItemSetup
              key={dialog.item?.id ?? "new"}
              base={base}
              materials={materials}
              item={dialog.item}
              close={() => setDialog(null)}
              saved={refresh}
            />
          )}{" "}
          {dialog?.type === "stock" && dialog.item && canEdit && (
            <StockOperation
              key={`${dialog.item.id}:${dialog.reversal?.id ?? ""}`}
              base={base}
              item={dialog.item}
              reversal={dialog.reversal}
              close={() => setDialog(null)}
              saved={refresh}
            />
          )}{" "}
          {dialog?.type === "history" && dialog.item && (
            <ItemHistory
              base={base}
              item={dialog.item}
              close={() => setDialog(null)}
            />
          )}{" "}
          {dialog?.type === "archive" && dialog.item && (
            <section className="costing-card">
              <p>
                Archive {dialog.item.name}? All history is retained. Items with
                stock or active recipe dependencies cannot be archived.
              </p>
              <button
                onClick={() => {
                  void archive(dialog.item!);
                  setDialog(null);
                }}
              >
                Confirm archive
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
export function InventoryTable({
  items,
  canEdit,
  onAction,
}: {
  items: Item[];
  canEdit: boolean;
  onAction: (type: string, item: Item) => void;
}) {
  return (
    <div className="inventory-scroll">
      <table>
        <thead>
          <tr>
            <th>Name / code</th>
            <th>Type</th>
            <th>Pack contents</th>
            <th>Current stock</th>
            <th>Low-stock threshold</th>
            <th>Latest costing price</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <strong>{i.name}</strong>
                <small>{i.code}</small>
              </td>
              <td>{i.kind === "RAW" ? "Raw ingredient" : "Packaging"}</td>
              <td>{i.source_text ?? "Not specified"}</td>
              <td className={i.stock_status === "LOW" ? "costing-warning" : ""}>
                {i.quantity == null
                  ? "Not counted"
                  : `${decimalDisplay(i.quantity)} ${unitLabel(i.base_unit)}`}
                {i.stock_status === "LOW" && <small>Low stock</small>}
              </td>
              <td>
                {i.minimum_quantity == null
                  ? "Not set"
                  : `${decimalDisplay(i.minimum_quantity)} ${unitLabel(i.base_unit)}`}
              </td>
              <td>
                {i.cost_price == null ? "Unknown" : money(i.cost_price)}
                {i.cost_price != null && (
                  <small>
                    {i.price_tax_basis === "INCLUSIVE"
                      ? "GST inclusive"
                      : "GST exclusive"}
                  </small>
                )}
                {i.price_quantity && (
                  <small>
                    Per {decimalDisplay(i.price_quantity)}{" "}
                    {unitLabel(i.price_unit ?? "")}
                  </small>
                )}
              </td>
              <td>
                <div className="costing-actions">
                  <button
                    className="costing-quiet"
                    onClick={() => onAction("history", i)}
                  >
                    History
                  </button>
                  {canEdit && (
                    <>
                      <button onClick={() => onAction("stock", i)}>
                        Stock operation
                      </button>
                      <button
                        className="costing-quiet"
                        onClick={() => onAction("setup", i)}
                      >
                        Settings
                      </button>
                      <button
                        className="costing-quiet"
                        onClick={() => onAction("archive", i)}
                      >
                        Archive
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
