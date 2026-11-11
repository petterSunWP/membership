import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import {
  units,
  type Unit,
  type Tax,
  type Material,
  type Line,
  type Cost,
  money,
  decimalDisplay,
} from "./api";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current;
    const first =
      element?.querySelector<HTMLElement>("input,select,textarea") ??
      element?.querySelector<HTMLElement>("button");
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = Array.from(
        element.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      );
      const start = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start?.focus();
      }
    };
    element?.addEventListener("keydown", keydown);
    return () => {
      element?.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return (
    <div className="costing-modal-backdrop">
      <section
        ref={dialog}
        className="costing-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="costing-quiet"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="costing-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="costing-error" role="alert">
      {message}
    </div>
  ) : null;
}
// Untouched inputs keep their original precise model value when submitted.
// Typed text is left alone until blur so decimal entry remains natural.
export function DecimalInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type"> & {
  value: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft ?? decimalDisplay(value, "")}
      onFocus={(event) => {
        setDraft(decimalDisplay(value, ""));
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
export function UnitSelect({
  value,
  onChange,
}: {
  value: Unit;
  onChange: (v: Unit) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Unit)}>
      {units.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}
export function TaxFields({
  tax,
  rate,
  onTax,
  onRate,
}: {
  tax: Tax;
  rate: string;
  onTax: (v: Tax) => void;
  onRate: (v: string) => void;
}) {
  return (
    <>
      <Field label="Entered price GST basis">
        <select
          value={tax}
          onChange={(e) => onTax(e.target.value as Tax)}
          required
        >
          <option value="">Choose explicitly…</option>
          <option value="EXCLUSIVE">GST exclusive</option>
          <option value="INCLUSIVE">GST inclusive</option>
        </select>
      </Field>
      <Field label="GST rate (fraction, e.g. 0.15 or 0)">
        <DecimalInput
          value={rate}
          inputMode="decimal"
          onChange={(e) => onRate(e.target.value)}
          required
          placeholder="Enter the applicable rate"
        />
      </Field>
    </>
  );
}
export function LineEditor({
  lines,
  onChange,
  materials,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  materials: Material[];
}) {
  const available = materials.filter((m) => m.status === "ACTIVE");
  const change = (i: number, patch: Partial<Line>) =>
    onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  return (
    <div className="costing-lines">
      {lines.map((line, i) => (
        <div className="costing-line" key={i}>
          <Field label={`Ingredient ${i + 1}`}>
            <select
              value={line.materialId}
              required
              onChange={(e) => {
                const m = available.find((m) => m.id === e.target.value);
                change(i, {
                  materialId: e.target.value,
                  unit: m?.unit_code ?? "g",
                });
              }}
            >
              <option value="">Choose ingredient or packaging…</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.kind.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <DecimalInput
              inputMode="decimal"
              value={line.quantity}
              onChange={(e) => change(i, { quantity: e.target.value })}
              required
            />
          </Field>
          <Field label="Unit">
            <UnitSelect
              value={line.unit}
              onChange={(unit) => change(i, { unit })}
            />
          </Field>
          <button
            type="button"
            className="costing-quiet"
            onClick={() => onChange(lines.filter((_, n) => i !== n))}
            aria-label={`Remove ingredient ${i + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="costing-secondary"
        disabled={!available.length}
        onClick={() =>
          onChange([
            ...lines,
            {
              materialId: available[0]?.id ?? "",
              quantity: "1",
              unit: available[0]?.unit_code ?? "g",
            },
          ])
        }
      >
        + Add ingredient or packaging
      </button>
      {!available.length && <p>Add and price your materials first.</p>}
    </div>
  );
}
export function CostCard({
  cost,
  materials,
  currency = "NZD",
}: {
  cost: Cost;
  materials: Material[];
  currency?: string;
}) {
  return (
    <section className="costing-result">
      <div className="costing-metrics">
        <div>
          <span>Recipe cost · ex GST</span>
          <strong>{money(cost.cost, currency)}</strong>
        </div>
        <div>
          <span>Revenue · ex GST</span>
          <strong>{money(cost.revenue, currency)}</strong>
        </div>
        <div>
          <span>Gross profit</span>
          <strong>{money(cost.grossProfit, currency)}</strong>
        </div>
        <div>
          <span>Gross margin</span>
          <strong>
            {cost.marginPercent === null
              ? "Undefined"
              : `${decimalDisplay(cost.marginPercent)}%`}
          </strong>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ingredient / packaging</th>
            <th>Quantity</th>
            <th>Cost · ex GST</th>
          </tr>
        </thead>
        <tbody>
          {cost.breakdown.map((line, i) => (
            <tr key={i}>
              <td>
                {materials.find((m) => m.id === line.materialId)?.name ??
                  `Material ${line.materialId}`}
              </td>
              <td>
                {decimalDisplay(line.quantity)} {line.unit}
              </td>
              <td>{money(line.cost, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="costing-muted">
        Calculated {new Date(cost.calculatedAt).toLocaleString("en-NZ")} ·
        ingredients and packaging only; labour and overheads excluded.
      </p>
    </section>
  );
}
