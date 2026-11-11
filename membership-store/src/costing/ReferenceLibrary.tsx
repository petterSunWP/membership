import { useState } from "react";
import type { FormEvent } from "react";
import { costingRequest, errorMessage, type Libraries } from "./api";
import { Field, ErrorBox, DecimalInput } from "./components";
export function ReferenceLibrary({
  base,
  type,
  data,
  canEdit,
  refresh,
}: {
  base: string;
  type: "sizes" | "option-groups" | "options";
  data: Libraries;
  canEdit: boolean;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [volume, setVolume] = useState("");
  const [group, setGroup] = useState(data.groups[0]?.id ?? "");
  const [kind, setKind] = useState("TOPPING");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const items =
    type === "sizes"
      ? data.sizes.map((s) => ({ id: s.id, name: s.label, extra: s.code }))
      : type === "option-groups"
        ? data.groups.map((g) => ({
            id: g.id,
            name: g.name,
            extra: `Choose ${g.min_selections}–${g.max_selections}`,
          }))
        : data.options.map((o) => ({
            id: o.id,
            name: o.name,
            extra: `${data.groups.find((g) => g.id === o.option_group_id)?.name} · ${o.kind.toLowerCase()}`,
          }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(
        `${base}/${type}`,
        "POST",
        type === "sizes"
          ? { code, label: name, nominalVolume: volume || undefined }
          : type === "option-groups"
            ? { name, min: Number(min), max: Number(max) }
            : { name, groupId: group, kind },
      );
      setName("");
      setCode("");
      setVolume("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function rename(item: { id: string; name: string }) {
    const value = window.prompt("New name", item.name);
    if (!value) return;
    try {
      await costingRequest(`${base}/${type}/${item.id}`, "PATCH", {
        name: value,
        previousName: item.name,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="costing-card">
      <h3>
        {type === "sizes"
          ? "Sizes"
          : type === "option-groups"
            ? "Selection groups"
            : "Options & toppings"}
      </h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Details</th>
            {canEdit && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.extra}</td>
              {canEdit && (
                <td>
                  <button
                    className="costing-quiet"
                    onClick={() => void rename(item)}
                  >
                    Rename
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p>No records yet.</p>}
      {canEdit && (
        <form onSubmit={submit}>
          <div className="costing-form-grid">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            {type === "sizes" && (
              <>
                <Field label="Code">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={30}
                  />
                </Field>
                <Field label="Nominal serving volume (ml, optional)">
                  <DecimalInput
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              </>
            )}
            {type === "option-groups" && (
              <>
                <Field label="Minimum selections">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Maximum selections">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    required
                  />
                </Field>
              </>
            )}
            {type === "options" && (
              <>
                <Field label="Selection group">
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    required
                  >
                    <option value="">Choose…</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {["TOPPING", "SUGAR", "ICE", "SUBSTITUTION", "OTHER"].map(
                      (k) => (
                        <option key={k}>{k}</option>
                      ),
                    )}
                  </select>
                </Field>
              </>
            )}
          </div>
          <ErrorBox message={error} />
          <button
            disabled={busy || (type === "options" && !data.groups.length)}
          >
            {busy
              ? "Saving…"
              : `+ Add ${type === "sizes" ? "size" : type === "option-groups" ? "group" : "option"}`}
          </button>
        </form>
      )}
    </section>
  );
}
