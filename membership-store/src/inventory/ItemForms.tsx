import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal, Field, ErrorBox, DecimalInput } from "../costing/components";
import { decimalDisplay, errorMessage } from "../costing/api";
import {
  inventoryRequest,
  unitLabel,
  actionLabel,
  todayNZ,
  type Item,
  type Detail,
  type Material,
  type Movement,
} from "./api";
export function ItemSetup({
  base,
  materials,
  item,
  close,
  saved,
}: {
  base: string;
  materials: Material[];
  item?: Item;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [materialId, setMaterial] = useState("");
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("RAW");
  const [pack, setPack] = useState(item?.source_text ?? "");
  const [unit, setUnit] = useState<string>(item?.base_unit ?? "g");
  const [minimum, setMinimum] = useState(item?.minimum_quantity ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = materials.find((m) => m.id === materialId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (item)
        await inventoryRequest(`${base}/items/${item.id}`, "PATCH", {
          version: item.row_version,
          minimumQuantity: minimum,
          packText: pack || undefined,
        });
      else
        await inventoryRequest(`${base}/items`, "POST", {
          materialId: materialId || undefined,
          code,
          name,
          kind,
          packText: pack || undefined,
          baseUnit: unit,
          minimumQuantity: minimum,
        });
      await saved();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        item
          ? `${item.name} · Inventory settings`
          : "Add / link inventory material"
      }
      onClose={close}
    >
      <form onSubmit={submit}>
        {!item && (
          <>
            <Field label="Link an existing costing material or create a shared record">
              <select
                value={materialId}
                onChange={(e) => {
                  const m = materials.find((m) => m.id === e.target.value);
                  setMaterial(e.target.value);
                  if (m) {
                    setCode(m.code);
                    setName(m.name);
                    setKind(m.kind);
                    setUnit(
                      m.kind === "PACKAGING"
                        ? "each"
                        : ["ml", "l"].includes(m.unit_code)
                          ? "ml"
                          : "g",
                    );
                  }
                }}
              >
                <option value="">New material (shared with costing)</option>
                {materials
                  .filter((m) => m.status === "ACTIVE" && m.kind !== "PREPARED")
                  .map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.code} · {m.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="costing-form-grid">
              <Field label="Inventory code">
                <input
                  value={code}
                  maxLength={50}
                  required
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <Field label="Material name">
                <input
                  value={name}
                  disabled={Boolean(existing)}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Type">
                <select
                  value={kind}
                  disabled={Boolean(existing)}
                  onChange={(e) => {
                    setKind(e.target.value);
                    if (e.target.value === "PACKAGING") setUnit("each");
                  }}
                >
                  <option value="RAW">Raw ingredient</option>
                  <option value="PACKAGING">Packaging</option>
                </select>
              </Field>
              <Field label="Stock base unit (when no pack specification is provided)">
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="each">each</option>
                </select>
              </Field>
            </div>
          </>
        )}
        <div className="costing-form-grid">
          <Field label="Pack contents (optional)">
            <input
              placeholder="For example: 3000g, 1.2kg, 1L, 50each"
              value={pack}
              onChange={(e) => setPack(e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field
            label={`Low-stock threshold${item ? ` (${unitLabel(item.base_unit)})` : ""} (leave blank to disable)`}
          >
            <DecimalInput
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
          </Field>
        </div>
        <p className="costing-muted">
          Stock supports kg to g and L to ml within the same dimension. Pack
          contents are independent of remaining stock. Changing a specification
          preserves historical prices. Record an opening count before stock
          movements.
        </p>
        <ErrorBox message={error} />
        <button disabled={busy}>
          {busy ? "Saving…" : "Save inventory item"}
        </button>
      </form>
    </Modal>
  );
}
export function StockOperation({
  base,
  item,
  close,
  saved,
  reversal,
}: {
  base: string;
  item: Item;
  close: () => void;
  saved: () => Promise<void>;
  reversal?: Movement;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [action, setAction] = useState(
    reversal ? "REVERSAL" : item.quantity == null ? "COUNT" : "RECEIPT",
  );
  const [quantity, setQuantity] = useState("");
  const [u, setUnit] = useState<string>(item.base_unit);
  const [mode, setMode] = useState("BASE");
  const [date, setDate] = useState(todayNZ());
  const [reason, setReason] = useState(
    reversal
      ? `Reverse movement #${reversal.id}`
      : item.quantity == null
        ? "Opening count"
        : "Manual receipt",
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void inventoryRequest<Detail>(`${base}/items/${item.id}`)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
  }, [base, item.id]);
  async function reload() {
    try {
      setDetail(await inventoryRequest<Detail>(`${base}/items/${item.id}`));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await inventoryRequest(`${base}/items/${item.id}/movements`, "POST", {
        action,
        date,
        reason,
        requestId,
        version: detail?.balance?.row_version ?? null,
        ...(reversal
          ? { reversalId: reversal.id }
          : mode === "PACK"
            ? { packCount: quantity, specId: detail?.spec?.id }
            : { quantity, unit: u }),
      });
      await saved();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const compatible =
    item.base_unit === "g"
      ? ["g", "kg"]
      : item.base_unit === "ml"
        ? ["ml", "l"]
        : ["each", "dozen"];
  return (
    <Modal
      title={`${item.name} · ${reversal ? "Reverse stock movement" : "Stock operation"}`}
      onClose={close}
    >
      {detail ? (
        <form onSubmit={submit}>
          <p className="inventory-balance">
            Current quantity:
            <strong>
              {detail.balance
                ? `${decimalDisplay(detail.balance.quantity)} ${unitLabel(item.base_unit)}`
                : "Not counted"}
            </strong>
            <button
              className="costing-quiet"
              type="button"
              onClick={() => void reload()}
            >
              Refresh quantity
            </button>
          </p>
          {reversal ? (
            <p className="costing-notice">
              Reverse movement #{reversal.id} ({actionLabel(reversal.action)}{" "}
              {decimalDisplay(reversal.quantity_delta)}{" "}
              {unitLabel(reversal.unit_code)}) by appending a reversal. The
              original movement is retained. Receipts cannot be reversed if
              stock is insufficient.
            </p>
          ) : (
            <>
              <div className="costing-form-grid">
                <Field label="Movement type">
                  <select
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setReason("Manual " + actionLabel(e.target.value));
                    }}
                  >
                    <option value="RECEIPT" disabled={!detail.balance}>
                      Receipt
                    </option>
                    <option value="ISSUE" disabled={!detail.balance}>
                      Issue
                    </option>
                    <option value="WASTE" disabled={!detail.balance}>
                      Waste
                    </option>
                    <option value="COUNT">
                      {detail.balance
                        ? "Count actual stock"
                        : "Set opening quantity"}
                    </option>
                  </select>
                </Field>
                <Field label="Quantity entry">
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="BASE">Base units</option>
                    {detail.spec && (
                      <option value="PACK">
                        Pack count ({detail.spec.source_text} / pack)
                      </option>
                    )}
                  </select>
                </Field>
                <Field
                  label={
                    action === "COUNT"
                      ? "Actual counted quantity (not the difference)"
                      : "Movement quantity"
                  }
                >
                  <DecimalInput
                    value={quantity}
                    required
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </Field>
                {mode === "BASE" && (
                  <Field label="Unit">
                    <select value={u} onChange={(e) => setUnit(e.target.value)}>
                      {compatible.map((unit) => (
                        <option key={unit} value={unit}>
                          {unitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              {!detail.balance && (
                <p className="costing-notice">
                  Uncounted stock is not zero. Confirm the opening quantity
                  (including an explicit zero) before recording receipts, issues
                  or waste.
                </p>
              )}
            </>
          )}
          <div className="costing-form-grid">
            <Field label="Movement date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Reason / notes">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
              />
            </Field>
          </div>
          <ErrorBox message={error} />
          <button disabled={busy}>
            {busy
              ? "Submitting…"
              : reversal
                ? "Confirm reversal"
                : action === "COUNT"
                  ? "Confirm actual count"
                  : "Confirm " + actionLabel(action)}
          </button>
        </form>
      ) : (
        <>
          <ErrorBox message={error} />
          <p>Loading current stock…</p>
        </>
      )}
    </Modal>
  );
}
export function ItemHistory({
  base,
  item,
  close,
}: {
  base: string;
  item: Item;
  close: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void inventoryRequest<Detail>(`${base}/items/${item.id}`)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
  }, [base, item.id]);
  return (
    <Modal
      title={`${item.name} · Stock & specification history`}
      onClose={close}
    >
      <ErrorBox message={error} />
      {detail ? (
        <>
          <p>
            Stock unit: {unitLabel(detail.item.base_unit)}; costing unit:
            {unitLabel(detail.material.unit_code)}. Current pack specification:
            {detail.spec?.source_text ?? "Not entered"}.
          </p>
          <MovementTable movements={detail.movements} />
          <details>
            <summary>Pack specification history</summary>
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Entered specification</th>
                  <th>Normalized quantity</th>
                  <th>Recorded at</th>
                </tr>
              </thead>
              <tbody>
                {detail.specs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.version}</td>
                    <td>{s.source_text}</td>
                    <td>
                      {decimalDisplay(s.quantity)} {unitLabel(s.unit_code)}
                    </td>
                    <td>{s.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </Modal>
  );
}
export function MovementTable({
  movements,
  onReverse,
}: {
  movements: Movement[];
  onReverse?: (m: Movement) => void;
}) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Date / movement</th>
            <th>Material / movement</th>
            <th>Change</th>
            <th>Before</th>
            <th>After</th>
            <th>Reason</th>
            {onReverse && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td>
                {m.observed_date}
                <small>
                  #{m.id} · Staff {m.created_by}
                </small>
              </td>
              <td>
                {m.name ?? m.code ?? ""}
                <small>
                  {actionLabel(m.action)}
                  {m.reversal_of
                    ? ` · Original movement #${m.reversal_of}`
                    : ""}
                </small>
              </td>
              <td>
                {m.quantity_delta.startsWith("-") ? "" : "+"}
                {decimalDisplay(m.quantity_delta)} {unitLabel(m.unit_code)}
              </td>
              <td>
                {m.quantity_before == null
                  ? "Not counted"
                  : decimalDisplay(m.quantity_before)}
              </td>
              <td>{decimalDisplay(m.quantity_after)}</td>
              <td>{m.reason}</td>
              {onReverse && (
                <td>
                  {["RECEIPT", "ISSUE", "WASTE"].includes(m.action) &&
                    !movements.some((v) => v.reversal_of === m.id) && (
                      <button
                        type="button"
                        className="costing-quiet"
                        onClick={() => onReverse(m)}
                      >
                        Reverse
                      </button>
                    )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!movements.length && (
        <p className="costing-empty">No stock movements yet.</p>
      )}
    </>
  );
}
