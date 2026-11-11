import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  costingRequest,
  decimalDisplay,
  errorMessage,
  money,
  mapLine,
  type Libraries,
  type Material,
  type MaterialDetail,
  type Unit,
  type Tax,
  type Line,
} from "./api";
import {
  Modal,
  DecimalInput,
  Field,
  UnitSelect,
  TaxFields,
  ErrorBox,
  LineEditor,
} from "./components";
type Props = {
  base: string;
  data: Libraries;
  kind: Material["kind"];
  canEdit: boolean;
  refresh: () => Promise<void>;
};
export function Materials({ base, data, kind, canEdit, refresh }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Material | "new" | null>(null);
  const [selected, setSelected] = useState<Material | null>(null);
  const [error, setError] = useState("");
  const materials = data.materials.filter(
    (m) =>
      m.kind === kind &&
      `${m.name} ${m.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function archive(m: Material) {
    if (
      !window.confirm(
        `Archive ${m.name}? Active dependencies will prevent archiving.`,
      )
    )
      return;
    try {
      await costingRequest(`${base}/materials/${m.id}/archive`, "POST", {
        version: m.row_version,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <div className="costing-toolbar">
        <input
          aria-label="Search materials"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canEdit && (
          <button onClick={() => setEditing("new")}>
            + Add{" "}
            {kind === "PREPARED"
              ? "prepared ingredient"
              : kind === "PACKAGING"
                ? "supply"
                : "raw ingredient"}
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      <div className="costing-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Unit cost · ex GST</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                </td>
                <td>{m.code}</td>
                <td>
                  {m.unitCost === null ? (
                    <span className="costing-warning">
                      {m.status === "ARCHIVED" ? "Archived" : "Needs costing"}
                    </span>
                  ) : (
                    <>
                      {money(m.unitCost)} / {m.unit_code}
                    </>
                  )}
                </td>
                <td>{m.status.toLowerCase()}</td>
                <td className="costing-actions">
                  <button
                    className="costing-secondary"
                    onClick={() => setSelected(m)}
                  >
                    {kind === "PREPARED"
                      ? "Preparation & yields"
                      : "Price & history"}
                  </button>
                  {canEdit && m.status === "ACTIVE" && (
                    <>
                      <button
                        className="costing-quiet"
                        onClick={() => setEditing(m)}
                      >
                        Edit
                      </button>
                      <button
                        className="costing-quiet"
                        onClick={() => void archive(m)}
                      >
                        Archive
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {materials.length === 0 && (
          <p className="costing-empty">
            No materials yet. Add your first item to start costing.
          </p>
        )}
      </div>
      {editing && (
        <MaterialForm
          key={editing === "new" ? "new" : editing.id}
          base={base}
          kind={kind}
          material={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {selected && (
        <MaterialEditor
          key={selected.id}
          base={base}
          material={selected}
          materials={data.materials}
          canEdit={canEdit && selected.status === "ACTIVE"}
          close={() => setSelected(null)}
          refresh={refresh}
        />
      )}
    </>
  );
}
function MaterialForm({
  base,
  kind,
  material,
  close,
  saved,
}: {
  base: string;
  kind: Material["kind"];
  material?: Material;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [name, setName] = useState(material?.name ?? "");
  const [code, setCode] = useState(material?.code ?? "");
  const [unit, setUnit] = useState<Unit>(
    material?.unit_code ??
      (kind === "PACKAGING" ? "each" : kind === "PREPARED" ? "ml" : "g"),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(
        `${base}/materials${material ? `/${material.id}` : ""}`,
        material ? "PATCH" : "POST",
        { name, code, kind, unit, version: material?.row_version },
      );
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={material ? "Edit material" : "Add material"} onClose={close}>
      <form onSubmit={submit}>
        <div className="costing-form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              required
            />
          </Field>
          <Field label="Code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={50}
              required
            />
          </Field>
          <Field label="Cost per unit">
            {material ? (
              <input value={unit} disabled />
            ) : (
              <UnitSelect value={unit} onChange={setUnit} />
            )}
          </Field>
        </div>
        <p className="costing-muted">
          {kind === "PREPARED"
            ? "This is the unit of the measured usable output. Batch input units are entered separately."
            : "Enter the price and corresponding usable quantity after saving."}
        </p>
        <ErrorBox message={error} />
        <button disabled={busy}>{busy ? "Saving…" : "Save material"}</button>
      </form>
    </Modal>
  );
}
function MaterialEditor({
  base,
  material,
  materials,
  canEdit,
  close,
  refresh,
}: {
  base: string;
  material: Material;
  materials: Material[];
  canEdit: boolean;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState("");
  const [dependents, setDependents] = useState("");
  const load = async () =>
    setDetail(
      await costingRequest<MaterialDetail>(`${base}/materials/${material.id}`),
    );
  useEffect(() => {
    void costingRequest<MaterialDetail>(`${base}/materials/${material.id}`)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
  }, [base, material.id]);
  async function saved() {
    await load();
    await refresh();
  }
  async function dependencies() {
    try {
      const d = await costingRequest<{
        recipes: { id: string; name: string }[];
        preparations: string[];
      }>(`${base}/materials/${material.id}/dependents`);
      setDependents(
        [
          ...new Set([
            ...d.recipes.map((r) => r.name),
            ...d.preparations.map(
              (id) => materials.find((m) => m.id === id)?.name ?? id,
            ),
          ]),
        ].join(", ") || "No active dependencies.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal title={material.name} onClose={close}>
      <ErrorBox message={error} />
      {detail ? (
        <>
          {material.kind === "PREPARED" ? (
            <PreparationForm
              key={`${detail.head?.row_version ?? 0}`}
              base={base}
              detail={detail}
              materials={materials}
              canEdit={canEdit}
              saved={saved}
            />
          ) : (
            <PriceForm
              key={`${detail.priceHead?.row_version ?? 0}`}
              base={base}
              detail={detail}
              canEdit={canEdit}
              saved={saved}
            />
          )}
          <hr />
          <button
            type="button"
            className="costing-secondary"
            onClick={() => void dependencies()}
          >
            Show active dependencies
          </button>
          {dependents && <p>{dependents}</p>}
        </>
      ) : (
        <p>Loading…</p>
      )}
    </Modal>
  );
}
export function PriceForm({
  base,
  detail,
  canEdit,
  saved,
}: {
  base: string;
  detail: MaterialDetail;
  canEdit: boolean;
  saved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [u, setUnit] = useState<Unit>(detail.material.unit_code);
  const current = detail.prices.find(
    (p) => String(p.id) === String(detail.priceHead?.price_id),
  );
  const spec = detail.inventorySpec?.compatible ? detail.inventorySpec : null;
  const [tax, setTax] = useState<Tax>(current?.tax_basis ?? "");
  const [rate, setRate] = useState(current?.gst_rate ?? "0.15");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(
        `${base}/materials/${detail.material.id}/prices`,
        "POST",
        {
          amount,
          quantity,
          inventorySpecId: spec?.id,
          unit: u,
          taxBasis: tax,
          gstRate: rate,
          notes,
          version: detail.priceHead?.row_version,
        },
      );
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {canEdit && (
        <form onSubmit={submit}>
          <h3>Enter a new material price</h3>
          <p className="costing-muted">
            Enter the price and the usable quantity it covers. A new price
            immediately updates dependent recipe costs.
          </p>
          <div className="costing-form-grid">
            <Field label="Entered price (NZD)">
              <DecimalInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                required
              />
            </Field>
            {spec ? (
              <Field label="Inventory pack specification (linked)">
                <p>
                  {spec.sourceText} · {decimalDisplay(spec.quantity)}{" "}
                  {spec.unit}
                </p>
              </Field>
            ) : (
              <>
                <Field label="Usable quantity">
                  <DecimalInput
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Quantity unit">
                  <UnitSelect value={u} onChange={setUnit} />
                </Field>
              </>
            )}
            {detail.inventorySpec && !detail.inventorySpec.compatible && (
              <p className="costing-warning">
                Inventory and recipe units have different dimensions. Enter the
                actual usable quantity; kg cannot be converted to ml
                automatically.
              </p>
            )}
            <TaxFields tax={tax} rate={rate} onTax={setTax} onRate={setRate} />
            <Field label="Notes (optional)">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
          <ErrorBox message={error} />
          <button disabled={busy}>
            {busy ? "Saving…" : "Save current price"}
          </button>
        </form>
      )}
      <h3>Price history</h3>
      <table>
        <thead>
          <tr>
            <th>Recorded</th>
            <th>Entered price</th>
            <th>Usable quantity</th>
            <th>GST basis / rate</th>
          </tr>
        </thead>
        <tbody>
          {detail.prices.map((p) => (
            <tr key={p.id}>
              <td>
                {p.created_at}
                {String(detail.priceHead?.price_id) === String(p.id) && (
                  <small>Current price</small>
                )}
              </td>
              <td>{money(p.amount)}</td>
              <td>
                {decimalDisplay(p.usable_quantity)} {p.unit_code}
              </td>
              <td>
                {p.tax_basis.toLowerCase()} / {decimalDisplay(p.gst_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!detail.prices.length && <p>No price entered yet.</p>}
    </>
  );
}
function PreparationForm({
  base,
  detail,
  materials,
  canEdit,
  saved,
}: {
  base: string;
  detail: MaterialDetail;
  materials: Material[];
  canEdit: boolean;
  saved: () => Promise<void>;
}) {
  const standard = detail.measurements.find(
    (y) => String(y.id) === String(detail.head?.yield_measurement_id),
  );
  const [lines, setLines] = useState<Line[]>(detail.lines.map(mapLine));
  const [quantity, setQuantity] = useState(standard?.quantity ?? "");
  const [u, setUnit] = useState<Unit>(
    standard?.unit_code ?? detail.material.unit_code,
  );
  const [instructions, setInstructions] = useState(
    detail.revisions.find(
      (r) => String(r.id) === String(detail.head?.preparation_revision_id),
    )?.instructions ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [measurement, setMeasurement] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState<Unit>(
    detail.material.unit_code,
  );
  const [select, setSelect] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(
        `${base}/materials/${detail.material.id}/preparation`,
        "POST",
        {
          lines,
          yieldQuantity: quantity,
          yieldUnit: u,
          instructions,
          version: detail.head?.row_version,
        },
      );
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addMeasurement(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(
        `${base}/materials/${detail.material.id}/yields`,
        "POST",
        {
          revisionId: detail.head?.preparation_revision_id,
          quantity: measurement,
          unit: measurementUnit,
          select,
          version: detail.head?.row_version,
        },
      );
      await saved();
      setMeasurement("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function choose(measurementId: string) {
    setBusy(true);
    try {
      await costingRequest(
        `${base}/materials/${detail.material.id}/standard-yield`,
        "PUT",
        { measurementId, version: detail.head?.row_version },
      );
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="costing-notice">
        Batch input units and usable output units are independent. For example,
        tea leaves measured in grams can produce an actual measured yield in
        millilitres.
      </p>
      {canEdit ? (
        <form onSubmit={submit}>
          <h3>Batch formulation</h3>
          <LineEditor
            lines={lines}
            onChange={setLines}
            materials={materials.filter((m) => m.id !== detail.material.id)}
          />
          <div className="costing-form-grid">
            <Field label="Measured usable yield">
              <DecimalInput
                value={quantity}
                inputMode="decimal"
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>
            <Field label="Output unit">
              <UnitSelect value={u} onChange={setUnit} />
            </Field>
            <Field label="Preparation instructions">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
              />
            </Field>
          </div>
          <button disabled={busy}>
            {busy ? "Saving…" : "Save batch & standard yield"}
          </button>
        </form>
      ) : (
        <p>
          {detail.lines
            .map(
              (l) =>
                `${materials.find((m) => m.id === l.input_material_id)?.name ?? l.input_material_id}: ${decimalDisplay(l.quantity)} ${l.unit_code}`,
            )
            .join(" · ")}
        </p>
      )}
      <ErrorBox message={error} />
      <h3>Yield measurements</h3>
      {standard && (
        <p>
          Current standard:{" "}
          <strong>
            {decimalDisplay(standard.quantity)} {standard.unit_code}
          </strong>
        </p>
      )}
      {canEdit && detail.head && (
        <form onSubmit={addMeasurement}>
          <div className="costing-inline">
            <Field label="New measured yield">
              <DecimalInput
                value={measurement}
                onChange={(e) => setMeasurement(e.target.value)}
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Unit">
              <UnitSelect
                value={measurementUnit}
                onChange={setMeasurementUnit}
              />
            </Field>
            <label className="costing-checkbox">
              <input
                type="checkbox"
                checked={select}
                onChange={(e) => setSelect(e.target.checked)}
              />
              Use as standard yield
            </label>
            <button disabled={busy}>Record measurement</button>
          </div>
        </form>
      )}
      <table>
        <thead>
          <tr>
            <th>Measured</th>
            <th>Usable yield</th>
            <th>Revision</th>
            <th>Standard</th>
          </tr>
        </thead>
        <tbody>
          {detail.measurements.map((y) => (
            <tr key={y.id}>
              <td>{y.measured_at}</td>
              <td>
                {decimalDisplay(y.quantity)} {y.unit_code}
              </td>
              <td>
                {
                  detail.revisions.find(
                    (r) => String(r.id) === String(y.preparation_revision_id),
                  )?.revision
                }
              </td>
              <td>
                {String(y.id) === String(standard?.id) ? (
                  "Selected"
                ) : canEdit &&
                  String(y.preparation_revision_id) ===
                    String(detail.head?.preparation_revision_id) ? (
                  <button
                    type="button"
                    className="costing-secondary"
                    disabled={busy}
                    onClick={() => void choose(y.id)}
                  >
                    Use this yield
                  </button>
                ) : (
                  "History"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
