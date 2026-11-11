import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  costingRequest,
  decimalDisplay,
  errorMessage,
  mapLine,
  money,
  type Libraries,
  type RecipeDetail,
  type Variant,
  type VariantOptions,
  type Line,
  type Tax,
  type Cost,
  type Effect,
} from "./api";
import {
  ErrorBox,
  Field,
  LineEditor,
  Modal,
  DecimalInput,
  TaxFields,
  CostCard,
  UnitSelect,
} from "./components";
import { ReferenceLibrary } from "./ReferenceLibrary";
type Props = {
  base: string;
  data: Libraries;
  canEdit: boolean;
  refresh: () => Promise<void>;
};
export function Recipes({ base, data, canEdit, refresh }: Props) {
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [sizes, setSizes] = useState(false);
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await costingRequest<{ id: string }>(
        `${base}/recipes`,
        "POST",
        { name: newName },
      );
      setNewName("");
      await refresh();
      setSelected(r.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="costing-toolbar">
        <Field label="Drink">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a drink recipe…</option>
            {data.recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.status === "ARCHIVED" ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </Field>
        {canEdit && (
          <button className="costing-secondary" onClick={() => setSizes(true)}>
            Manage sizes
          </button>
        )}
      </div>
      {canEdit && (
        <form className="costing-inline costing-card" onSubmit={create}>
          <Field label="New drink recipe">
            <input
              placeholder="e.g. Jasmine milk tea"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </Field>
          <button disabled={busy}>+ Add drink</button>
        </form>
      )}
      <ErrorBox message={error} />
      {selected ? (
        <RecipeEditor
          key={selected}
          base={base}
          recipeId={selected}
          data={data}
          canEdit={canEdit}
          refresh={refresh}
        />
      ) : (
        <div className="costing-empty">
          Create or choose a drink. Add a size, link an existing product, then
          enter its formulation.
        </div>
      )}
      {sizes && (
        <Modal title="Drink sizes" onClose={() => setSizes(false)}>
          <ReferenceLibrary
            base={base}
            type="sizes"
            data={data}
            canEdit={canEdit}
            refresh={refresh}
          />
        </Modal>
      )}
    </>
  );
}
function RecipeEditor({
  base,
  recipeId,
  data,
  canEdit,
  refresh,
}: {
  base: string;
  recipeId: string;
  data: Libraries;
  canEdit: boolean;
  refresh: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void costingRequest<RecipeDetail>(`${base}/recipes/${recipeId}`)
      .then((d) => {
        setDetail(d);
        setSelected(d.variants[0]?.id ?? "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [base, recipeId]);
  async function reload() {
    const d = await costingRequest<RecipeDetail>(`${base}/recipes/${recipeId}`);
    setDetail(d);
    await refresh();
  }
  async function archive() {
    if (!detail || !window.confirm(`Archive ${detail.recipe.name}?`)) return;
    try {
      await costingRequest(`${base}/recipes/${recipeId}/archive`, "POST", {
        version: detail.recipe.row_version,
      });
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function rename() {
    if (!detail) return;
    const name = window.prompt("Drink name", detail.recipe.name);
    if (!name) return;
    try {
      await costingRequest(`${base}/recipes/${recipeId}`, "PATCH", {
        name,
        version: detail.recipe.row_version,
      });
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const variant = detail?.variants.find((v) => v.id === selected);
  const editable = canEdit && detail?.recipe.status === "ACTIVE";
  return (
    <>
      <ErrorBox message={error} />
      {detail ? (
        <section className="costing-card">
          <div className="costing-toolbar">
            <h2>{detail.recipe.name}</h2>
            <div className="costing-actions">
              {editable && (
                <>
                  <button
                    className="costing-quiet"
                    onClick={() => void rename()}
                  >
                    Rename
                  </button>
                  <button
                    className="costing-quiet"
                    onClick={() => void archive()}
                  >
                    Archive drink
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="costing-size-tabs">
            {detail.variants.map((v) => (
              <button
                key={v.id}
                className={v.id === selected ? "" : "costing-secondary"}
                onClick={() => setSelected(v.id)}
              >
                {data.sizes.find((z) => z.id === v.size_id)?.label ??
                  v.size_label}
              </button>
            ))}
            {editable && (
              <button
                className="costing-secondary"
                disabled={!data.sizes.length}
                onClick={() => setAdding(true)}
              >
                + Add size variant
              </button>
            )}
          </div>
          {!data.sizes.length && <p>Add a size using “Manage sizes” above.</p>}
          {variant && (
            <VariantEditor
              key={`${variant.id}-${variant.row_version}-${variant.head?.row_version ?? 0}`}
              base={base}
              variant={variant}
              recipeId={recipeId}
              data={data}
              canEdit={Boolean(editable)}
              saved={reload}
            />
          )}
        </section>
      ) : (
        <p>Loading drink…</p>
      )}
      {adding && (
        <Modal title="Add size variant" onClose={() => setAdding(false)}>
          <VariantPriceForm
            base={base}
            recipeId={recipeId}
            data={data}
            excludedSizes={detail?.variants.map((v) => v.size_id)}
            saved={async (id) => {
              setAdding(false);
              await reload();
              setSelected(id);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function VariantPriceForm({
  base,
  recipeId,
  data,
  variant,
  excludedSizes = [],
  saved,
}: {
  base: string;
  recipeId: string;
  data: Libraries;
  variant?: Variant;
  excludedSizes?: string[];
  saved: (id: string) => Promise<void>;
}) {
  const [size, setSize] = useState(
    variant?.size_id ??
      data.sizes.find((s) => !excludedSizes.includes(s.id))?.id ??
      "",
  );
  const [product, setProduct] = useState(variant?.product_id ?? "");
  const [source, setSource] = useState<"PRODUCT" | "OVERRIDE">(
    variant?.price_source ?? "PRODUCT",
  );
  const [override, setOverride] = useState(variant?.price_override ?? "");
  const [tax, setTax] = useState<Tax>(variant?.tax_basis ?? "");
  const [rate, setRate] = useState(variant?.gst_rate ?? "0.15");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await costingRequest<{ id: string }>(
        `${base}/recipes/${recipeId}/variants${variant ? `/${variant.id}` : ""}`,
        variant ? "PATCH" : "POST",
        {
          sizeId: size,
          productId: product || undefined,
          priceSource: source,
          priceOverride: override,
          taxBasis: tax,
          gstRate: rate,
          version: variant?.row_version,
        },
      );
      await saved(r.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="costing-form-grid">
        <Field label="Size">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            required
          >
            {data.sizes
              .filter(
                (z) =>
                  z.id === variant?.size_id || !excludedSizes.includes(z.id),
              )
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Existing Member2Go product">
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required={source === "PRODUCT"}
          >
            <option value="">No product linked</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.code} · {money(p.price)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Selling price source">
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "PRODUCT" | "OVERRIDE")
            }
          >
            <option value="PRODUCT">Use existing product price</option>
            <option value="OVERRIDE">Costing-only size price</option>
          </select>
        </Field>
        {source === "OVERRIDE" && (
          <Field label="Costing-only selling price (NZD)">
            <DecimalInput
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
        )}
        <TaxFields tax={tax} rate={rate} onTax={setTax} onRate={setRate} />
      </div>
      <p className="costing-muted">
        Existing product records and prices are never changed. Configure the GST
        treatment of the selected selling price explicitly.
      </p>
      <ErrorBox message={error} />
      <button disabled={busy || !size}>
        {busy
          ? "Saving…"
          : variant
            ? "Save selling price settings"
            : "Create size variant"}
      </button>
    </form>
  );
}
function VariantEditor({
  base,
  variant,
  recipeId,
  data,
  canEdit,
  saved,
}: {
  base: string;
  variant: Variant;
  recipeId: string;
  data: Libraries;
  canEdit: boolean;
  saved: () => Promise<void>;
}) {
  const [lines, setLines] = useState<Line[]>(variant.lines.map(mapLine));
  const [reset, setReset] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState<Cost | null>(null);
  const [available, setAvailable] = useState<VariantOptions>({
    groups: [],
    options: [],
  });
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [attach, setAttach] = useState(false);
  async function loadOptions() {
    const a = await costingRequest<VariantOptions>(
      `${base}/variants/${variant.id}/options`,
    );
    setAvailable(a);
    setSelections(
      Object.fromEntries(
        a.options
          .filter((o) => Number(o.is_default) === 1)
          .map((o) => [o.id, 1]),
      ),
    );
  }
  useEffect(() => {
    let active = true;
    void costingRequest<VariantOptions>(
      `${base}/variants/${variant.id}/options`,
    )
      .then((a) => {
        if (active) {
          setAvailable(a);
          setSelections(
            Object.fromEntries(
              a.options
                .filter((o) => Number(o.is_default) === 1)
                .map((o) => [o.id, 1]),
            ),
          );
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [base, variant.id]);
  async function saveLines(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(`${base}/variants/${variant.id}/revisions`, "POST", {
        lines,
        version: variant.head?.row_version,
        resetCustomisations: reset,
      });
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function calculate() {
    setBusy(true);
    setCost(null);
    try {
      const c = await costingRequest<Cost>(
        `${base}/variants/${variant.id}/cost-preview`,
        "POST",
        {
          selections: Object.entries(selections).map(
            ([attachmentId, portions]) => ({ attachmentId, portions }),
          ),
        },
      );
      setCost(c);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(attachmentId: string) {
    if (!window.confirm("Remove this option from the size variant?")) return;
    try {
      await costingRequest(
        `${base}/variants/${variant.id}/options/${attachmentId}`,
        "DELETE",
      );
      await loadOptions();
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <details>
        <summary>Selling price & product mapping</summary>
        {canEdit ? (
          <VariantPriceForm
            base={base}
            recipeId={recipeId}
            data={data}
            variant={variant}
            saved={saved}
          />
        ) : (
          <p>
            {variant.price_source === "PRODUCT"
              ? "Linked product price"
              : money(variant.price_override)}{" "}
            · {variant.tax_basis.toLowerCase()}
          </p>
        )}
      </details>
      <h3>Size formulation</h3>
      <p className="costing-muted">
        Enter this size’s actual quantities, including cups, lids and other
        packaging. Sizes are not automatically scaled.
      </p>
      {canEdit ? (
        <form onSubmit={saveLines}>
          <LineEditor
            lines={lines}
            onChange={setLines}
            materials={data.materials}
          />
          {available.options.some((o) => o.effects.length > 0) && (
            <label className="costing-checkbox">
              <input
                type="checkbox"
                checked={reset}
                onChange={(e) => setReset(e.target.checked)}
              />
              I will remove and rebuild customisation effects after changing
              this formulation.
            </label>
          )}
          <button disabled={busy || !lines.length}>Save formulation</button>
        </form>
      ) : (
        <p>
          {variant.lines
            .map(
              (l) =>
                `${data.materials.find((m) => m.id === l.material_id)?.name}: ${decimalDisplay(l.quantity)} ${l.unit_code}`,
            )
            .join(" · ")}
        </p>
      )}
      <details>
        <summary>Formulation history ({variant.revisions.length})</summary>
        {variant.revisions.map((r) => (
          <p key={r.id}>
            Revision {r.revision} · {r.created_at}
          </p>
        ))}
      </details>
      <hr />
      <div className="costing-toolbar">
        <h3>Toppings & customisations</h3>
        {canEdit && (
          <button
            type="button"
            className="costing-secondary"
            disabled={!variant.head || !data.options.length}
            onClick={() => setAttach(true)}
          >
            + Attach option
          </button>
        )}
      </div>
      {!data.options.length && (
        <p>
          Create option groups and options in the Toppings & Customisations tab
          first.
        </p>
      )}
      {available.groups.map((g) => (
        <fieldset className="costing-option-group" key={g.id}>
          <legend>
            {g.name} · choose {g.min_selections}–{g.max_selections}
          </legend>
          {available.options
            .filter((o) => o.option_group_id === g.id)
            .map((o) => (
              <div className="costing-inline" key={o.id}>
                <label className="costing-checkbox">
                  <input
                    type="checkbox"
                    checked={o.id in selections}
                    onChange={(e) =>
                      setSelections((old) => {
                        const next = { ...old };
                        if (e.target.checked) next[o.id] = 1;
                        else delete next[o.id];
                        return next;
                      })
                    }
                  />
                  {o.name} · {money(o.price_adjustment)}{" "}
                  {o.tax_basis.toLowerCase()}
                  {Number(o.is_default) === 1 ? " · default" : ""}
                </label>
                {o.id in selections && (
                  <Field label="Portions">
                    <input
                      type="number"
                      min={1}
                      max={o.max_portions}
                      value={selections[o.id]}
                      onChange={(e) =>
                        setSelections({
                          ...selections,
                          [o.id]: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                )}
                {o.effects.some(
                  (e) =>
                    e.recipe_revision_id !== variant.head?.recipe_revision_id,
                ) && (
                  <span className="costing-warning">
                    Rebuild effects for current formulation
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="costing-quiet"
                    onClick={() => void remove(o.id)}
                  >
                    Remove from size
                  </button>
                )}
              </div>
            ))}
        </fieldset>
      ))}
      <ErrorBox message={error} />
      <button
        type="button"
        disabled={busy || !variant.head}
        onClick={() => void calculate()}
      >
        {busy ? "Working…" : "Calculate selected recipe"}
      </button>
      {cost && <CostCard cost={cost} materials={data.materials} />}
      <p className="costing-muted">
        Cost preview uses saved formulation and latest ingredient prices. Save
        edits before calculating.
      </p>
      {attach && (
        <Modal
          title="Attach topping or customisation"
          onClose={() => setAttach(false)}
        >
          <AttachOption
            base={base}
            variant={variant}
            data={data}
            existing={available.options.map((o) => o.option_id)}
            saved={async () => {
              setAttach(false);
              await loadOptions();
              await saved();
            }}
          />
        </Modal>
      )}
    </>
  );
}
function AttachOption({
  base,
  variant,
  data,
  existing,
  saved,
}: {
  base: string;
  variant: Variant;
  data: Libraries;
  existing: string[];
  saved: () => Promise<void>;
}) {
  const available = data.options.filter((o) => !existing.includes(o.id));
  const [option, setOption] = useState(available[0]?.id ?? "");
  const [surcharge, setSurcharge] = useState("");
  const [tax, setTax] = useState<Tax>("");
  const [rate, setRate] = useState("0.15");
  const [isDefault, setDefault] = useState(false);
  const [portions, setPortions] = useState("1");
  const [effects, setEffects] = useState<Effect[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (i: number, patch: Partial<Effect>) =>
    setEffects((old) => old.map((e, n) => (i === n ? { ...e, ...patch } : e)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(`${base}/variants/${variant.id}/options`, "POST", {
        optionId: option,
        surcharge,
        taxBasis: tax,
        gstRate: rate,
        isDefault,
        maxPortions: Number(portions),
        effects: effects.map((e) => ({
          operation: e.operation,
          targetLineId: e.operation === "ADD" ? undefined : e.targetLineId,
          materialId: ["ADD", "REPLACE"].includes(e.operation)
            ? e.materialId
            : undefined,
          quantity: e.operation === "REMOVE" ? undefined : e.quantity,
          unit: e.operation === "REMOVE" ? undefined : e.unit,
        })),
      });
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="costing-form-grid">
        <Field label="Option">
          <select
            value={option}
            onChange={(e) => setOption(e.target.value)}
            required
          >
            <option value="">Choose…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {data.groups.find((g) => g.id === o.option_group_id)?.name} /{" "}
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Selling price surcharge (enter 0 if free)">
          <DecimalInput
            value={surcharge}
            onChange={(e) => setSurcharge(e.target.value)}
            inputMode="decimal"
            required
          />
        </Field>
        <TaxFields tax={tax} rate={rate} onTax={setTax} onRate={setRate} />
        <Field label="Maximum portions">
          <input
            type="number"
            min={1}
            max={10}
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            required
          />
        </Field>
        <label className="costing-checkbox">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setDefault(e.target.checked)}
          />
          Selected by default
        </label>
      </div>
      <h3>Recipe changes</h3>
      <p className="costing-muted">
        Configure explicit additions or changes. “Less ice” does not
        automatically add milk. Only additive toppings support multiple
        portions.
      </p>
      {effects.map((effect, i) => (
        <div className="costing-effect" key={i}>
          <div className="costing-form-grid">
            <Field label="Change">
              <select
                value={effect.operation}
                onChange={(e) =>
                  change(i, {
                    operation: e.target.value as Effect["operation"],
                  })
                }
              >
                {["ADD", "REMOVE", "REPLACE", "SET_QUANTITY"].map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            {effect.operation !== "ADD" && (
              <Field label="Original recipe line">
                <select
                  value={effect.targetLineId ?? ""}
                  onChange={(e) => change(i, { targetLineId: e.target.value })}
                  required
                >
                  <option value="">Choose line…</option>
                  {variant.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {data.materials.find((m) => m.id === l.material_id)?.name}{" "}
                      · {decimalDisplay(l.quantity)} {l.unit_code}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {["ADD", "REPLACE"].includes(effect.operation) && (
              <Field label="Ingredient / prepared topping">
                <select
                  value={effect.materialId ?? ""}
                  onChange={(e) =>
                    change(i, {
                      materialId: e.target.value,
                      unit:
                        data.materials.find((m) => m.id === e.target.value)
                          ?.unit_code ?? "g",
                    })
                  }
                  required
                >
                  <option value="">Choose…</option>
                  {data.materials
                    .filter((m) => m.status === "ACTIVE")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {effect.operation !== "REMOVE" && (
              <>
                <Field label="Quantity">
                  <DecimalInput
                    value={effect.quantity ?? ""}
                    onChange={(e) => change(i, { quantity: e.target.value })}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Unit">
                  <UnitSelect
                    value={effect.unit ?? "g"}
                    onChange={(unit) => change(i, { unit })}
                  />
                </Field>
              </>
            )}
          </div>
          <button
            type="button"
            className="costing-quiet"
            onClick={() => setEffects((old) => old.filter((_, n) => n !== i))}
          >
            Remove change
          </button>
        </div>
      ))}
      <div className="costing-actions">
        <button
          type="button"
          className="costing-secondary"
          onClick={() =>
            setEffects((old) => [
              ...old,
              { operation: "ADD", quantity: "1", unit: "g" },
            ])
          }
        >
          + Add recipe change
        </button>
        <button disabled={busy || !option}>
          {busy ? "Saving…" : "Attach option"}
        </button>
      </div>
      <ErrorBox message={error} />
    </form>
  );
}
