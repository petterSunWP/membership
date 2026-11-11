import { useRef, useState } from "react";
import { DecimalInput, ErrorBox, Field } from "../costing/components";
import { decimalDisplay, errorMessage, money } from "../costing/api";
import {
  inventoryRequest,
  downloadInventoryTemplate,
  uploadInventory,
  unitLabel,
  type ImportRow,
  type Preview,
  type ImportResult,
  type Material,
  type ImportMode,
} from "./api";
export function ImportPanel({
  base,
  materials,
  saved,
}: {
  base: string;
  materials: Material[];
  saved: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ImportMode>("STOCKTAKE");
  const [batchId, setBatchId] = useState("");
  const needsBatch = mode === "RECEIPT" && !batchId.trim();
  const [rows, setRows] = useState<ImportRow[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [dirty, setDirty] = useState(false),
    [result, setResult] = useState<ImportResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tax, setTax] = useState("EXCLUSIVE"),
    [rate, setRate] = useState("0.15"),
    [sync, setSync] = useState(true),
    [mappings, setMappings] = useState<Record<string, string>>({}),
    [excluded, setExcluded] = useState<string[]>([]);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await downloadInventoryTemplate(base);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-price-update.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(data = rows) {
    setBusy(true);
    setError("");
    try {
      setDirty(true);
      setPreview(
        await inventoryRequest<Preview>(`${base}/imports/preview`, "POST", {
          rows: data,
          mode,
          batchId,
          taxBasis: tax,
          gstRate: rate,
          syncPrices: sync,
          mappings,
          excludedCodes: excluded,
        }),
      );
      setDirty(false);
      setResult(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    setPreview(null);
    setResult(null);
    setMappings({});
    setExcluded([]);
    try {
      const data = await uploadInventory(base, file);
      setRows(data);
      setDirty(true);
      setPreview(
        await inventoryRequest<Preview>(`${base}/imports/preview`, "POST", {
          rows: data,
          mode,
          batchId,
          taxBasis: tax,
          gstRate: rate,
          syncPrices: sync,
          mappings: {},
          excludedCodes: [],
        }),
      );
      setDirty(false);
      setResult(null);
    } catch (e) {
      setRows([]);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || dirty) return;
    setBusy(true);
    try {
      setResult(
        await inventoryRequest<ImportResult>(
          `${base}/imports/${preview.id}/confirm`,
          "POST",
          { previewToken: preview.previewToken },
        ),
      );
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="costing-card inventory-import">
      <div className="inventory-import-heading">
        <h2>Excel Inventory Import</h2>
        <button
          type="button"
          className="costing-secondary"
          disabled={busy}
          onClick={() => void download()}
        >
          Download current template
        </button>
      </div>
      <p className="inventory-import-description">
        Use the reviewed nine-column template. Enter pack counts for raw
        ingredients and total counts for packaging. Blank quantities and prices
        remain unknown. Choose Stocktake to set actual balances, or Stock
        Receipt to add incoming quantities.
      </p>
      <p className="inventory-import-template-note">
        The current template includes materials, pack contents and GST-exclusive
        prices. Stock fields are left blank for safe price-only updates. For
        packaging prices, enter the actual pack contents (for example, 1each or
        100each).
      </p>
      <div className="inventory-import-mode">
        <Field label="Import mode">
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              setMode(e.target.value as ImportMode);
              setDirty(true);
              setResult(null);
            }}
          >
            <option value="STOCKTAKE">
              Stocktake — set actual counted stock
            </option>
            <option value="RECEIPT">Stock Receipt — add incoming stock</option>
          </select>
        </Field>
        {mode === "RECEIPT" ? (
          <Field label="Receipt batch reference (required)">
            <input
              value={batchId}
              maxLength={80}
              disabled={busy}
              placeholder="For example: DELIVERY-2026-001"
              onChange={(e) => {
                setBatchId(e.target.value);
                setDirty(true);
                setResult(null);
              }}
            />
            <small className="inventory-import-help">
              Reuse the same delivery reference when retrying. A posted batch
              cannot be posted twice.
            </small>
          </Field>
        ) : (
          <p className="inventory-import-help">
            Stocktake replaces the balance only for quantities you enter. Zero
            means zero; blank quantities and missing items remain unchanged.
          </p>
        )}
      </div>
      <p className="inventory-import-help">
        {mode === "RECEIPT"
          ? "Receipt quantities add to a known opening balance. Zero receipt quantities make no stock change. Use Count Date as the receipt date; establish opening stock with a Stocktake first."
          : "Use Count Date as the actual stocktake date."}{" "}
        A batch with errors cannot be confirmed. To omit rows, select Skip and
        refresh the preview; only the explicitly included valid rows will be
        applied together.
      </p>
      <div className="inventory-import-settings">
        <Field label="Price basis">
          <select
            disabled={busy}
            value={tax}
            onChange={(e) => {
              setTax(e.target.value);
              setDirty(true);
            }}
          >
            <option value="EXCLUSIVE">GST exclusive</option>
            <option value="INCLUSIVE">GST inclusive</option>
          </select>
          <small className="inventory-import-help">
            Select the basis used by the source prices.
          </small>
        </Field>
        <Field label="GST rate">
          <DecimalInput
            disabled={busy}
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setDirty(true);
            }}
          />
          <small className="inventory-import-help">
            Use 0 for a zero GST rate.
          </small>
        </Field>
        <div className="costing-field">
          <span>Costing integration</span>
          <label className="inventory-import-toggle">
            <input
              type="checkbox"
              disabled={busy}
              checked={sync}
              onChange={(e) => {
                setSync(e.target.checked);
                setDirty(true);
              }}
            />
            <span>Sync entered pack prices</span>
          </label>
          <small className="inventory-import-help">
            Apply known prices to recipe costing.
          </small>
        </div>
      </div>
      <div className="inventory-import-upload">
        <div className="inventory-import-file-info">
          <strong>Inventory workbook</strong>
          <span className="inventory-import-help">
            Excel (.xlsx) · Maximum 3MB / 1,000 rows
          </span>
        </div>
        <div className="inventory-import-file-picker">
          <input
            ref={fileInput}
            className="inventory-import-file-input"
            aria-label="Inventory workbook"
            disabled={busy || needsBatch}
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setFileName(file.name);
                void upload(file);
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="costing-secondary"
            disabled={busy || needsBatch}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Processing…" : "Choose file"}
          </button>
          <span
            className="inventory-import-file-name"
            title={fileName || undefined}
            aria-live="polite"
          >
            {fileName || "No file selected"}
          </span>
        </div>
      </div>
      <ErrorBox message={error} />
      {dirty && (
        <p className="costing-warning">
          Settings have changed. Refresh the preview before confirming.
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p>
            Read {rows.length} rows. Refresh the preview after changing tax,
            links or skipped rows.
          </p>
          <button disabled={busy || needsBatch} onClick={() => void review()}>
            {busy ? "Processing…" : "Refresh preview"}
          </button>
          {preview && (
            <>
              <p className="costing-notice">
                {preview.completed
                  ? "This content has already been imported. Confirming again will not adjust stock."
                  : `Ready ${preview.summary?.ready} · Skipped ${preview.summary?.skipped} · Errors ${preview.summary?.errors} · Stock updates ${preview.summary?.stockCounts} · Prices ${preview.summary?.prices}`}
              </p>
              <p className="inventory-import-help">
                Import #{preview.id} · {preview.mode ?? "STOCKTAKE"}
                {preview.batchId ? ` · Batch ${preview.batchId}` : ""}
              </p>
              <div className="inventory-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Material / code</th>
                      <th>Status</th>
                      <th>Current stock</th>
                      <th>
                        {(preview.mode ?? "STOCKTAKE") === "RECEIPT"
                          ? "Incoming quantity"
                          : "Counted quantity"}
                      </th>
                      <th>Resulting stock</th>
                      <th>Price change</th>
                      <th>Material link</th>
                      <th>Skip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.plans.map((p) => (
                      <tr key={p.code}>
                        <td>
                          {p.name}
                          <small>
                            {p.code} ·{" "}
                            {p.kind === "PACKAGING"
                              ? "Packaging"
                              : "Raw ingredient"}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {p.status === "ERROR"
                              ? "Needs review"
                              : p.status === "SKIP"
                                ? "Skip"
                                : "Ready"}
                          </strong>
                          <small>{p.message}</small>
                          {p.warnings.map((w) => (
                            <small key={w} className="costing-warning">
                              {w}
                            </small>
                          ))}
                        </td>
                        <td>
                          {p.currentStock === undefined
                            ? "—"
                            : p.currentStock === null
                              ? "Not counted"
                              : `${decimalDisplay(p.currentStock)} ${unitLabel(p.baseUnit ?? "")}`}
                        </td>
                        <td>
                          {p.stock
                            ? `${decimalDisplay(p.stock.quantity)} ${unitLabel(p.stock.unit)}`
                            : "No stock update"}
                          {p.observedDate && <small>{p.observedDate}</small>}
                        </td>
                        <td>
                          {p.resultingStock === undefined
                            ? "—"
                            : p.resultingStock === null
                              ? "Unchanged (not counted)"
                              : `${decimalDisplay(p.resultingStock)} ${unitLabel(p.baseUnit ?? "")}`}
                        </td>
                        <td>
                          {p.changesPrice && p.nextPrice ? (
                            <>
                              <small>
                                Current:{" "}
                                {p.currentPrice
                                  ? `${money(p.currentPrice.amount)} / ${decimalDisplay(p.currentPrice.quantity)} ${unitLabel(p.currentPrice.unit)} (${p.currentPrice.taxBasis.toLowerCase()}, GST ${decimalDisplay(p.currentPrice.gstRate)})`
                                  : "Unknown"}
                              </small>
                              <strong>
                                New: {money(p.nextPrice.amount)} /{" "}
                                {decimalDisplay(p.nextPrice.quantity)}{" "}
                                {unitLabel(p.nextPrice.unit)}
                              </strong>
                              <small>
                                {p.nextPrice.taxBasis.toLowerCase()} · GST{" "}
                                {decimalDisplay(p.nextPrice.gstRate)}
                              </small>
                            </>
                          ) : (
                            "No price change"
                          )}
                        </td>
                        <td>
                          <select
                            disabled={busy || preview.completed}
                            value={mappings[p.code] ?? ""}
                            onChange={(e) => {
                              setMappings({
                                ...mappings,
                                [p.code]: e.target.value,
                              });
                              setDirty(true);
                            }}
                          >
                            <option value="">
                              Match code and name automatically
                            </option>
                            {materials
                              .filter(
                                (m) =>
                                  m.status === "ACTIVE" && m.kind === p.kind,
                              )
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.code} · {m.name}
                                </option>
                              ))}
                            <option value="new">
                              Create a separate material
                            </option>
                          </select>
                          {p.materialName && (
                            <small>Linked material: {p.materialName}</small>
                          )}
                        </td>
                        <td>
                          <input
                            aria-label={`Skip ${p.code}`}
                            type="checkbox"
                            disabled={busy || preview.completed}
                            checked={excluded.includes(p.code)}
                            onChange={(e) => {
                              setExcluded(
                                e.target.checked
                                  ? [...excluded, p.code]
                                  : excluded.filter((c) => c !== p.code),
                              );
                              setDirty(true);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={
                  busy ||
                  dirty ||
                  needsBatch ||
                  Boolean(result) ||
                  (!preview.completed &&
                    (!preview.summary?.ready || !!preview.summary?.errors))
                }
                onClick={() => void confirm()}
              >
                Confirm stock and price import
              </button>
            </>
          )}
        </>
      )}
      {result && (
        <p className="costing-notice">
          {result.duplicate
            ? "Already processed. No duplicate import."
            : "Import complete."}{" "}
          Import #{result.importId}
          {result.batchId ? ` · Batch ${result.batchId}` : ""} · Items created{" "}
          {result.itemsCreated} · Stock updates {result.stockCounts} · Prices{" "}
          {result.prices} · Deferred prices {result.pricesDeferred} · Skipped{" "}
          {result.skipped}.
        </p>
      )}
    </section>
  );
}
