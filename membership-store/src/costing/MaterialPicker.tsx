import { useEffect, useId, useRef, useState } from "react";
import type { Material } from "./api";
import { searchMaterials } from "./formulation";
export function MaterialPicker({
  label,
  materials,
  value,
  onSelect,
}: {
  label: string;
  materials: Material[];
  value: string;
  onSelect: (material: Material | null) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    options = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = materials.find(
    (m) => m.id === value && m.status === "ACTIVE",
  );
  const matches = searchMaterials(materials, query ?? "");
  const visible =
    query === null && selected
      ? [selected, ...matches.filter((m) => m.id !== selected.id).slice(0, 59)]
      : matches.slice(0, 60);
  const highlighted = visible.length ? Math.min(active, visible.length - 1) : 0;
  useEffect(() => {
    if (open)
      options.current[highlighted]?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlighted, query]);
  function choose(m: Material) {
    onSelect(m);
    setQuery(null);
    setOpen(false);
    setActive(0);
  }
  return (
    <div className="costing-field">
      <label htmlFor={id}>{label}</label>
      <div
        className="costing-material-picker"
        ref={root}
        onBlur={(e) => {
          if (!root.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
            setQuery(null);
          }
        }}
      >
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && visible.length ? `${id}-option-${highlighted}` : undefined
          }
          autoComplete="off"
          required
          placeholder="Search ingredient or packaging by name or code…"
          value={
            query ?? (selected ? `${selected.name} · ${selected.code}` : "")
          }
          onClick={(e) => {
            if (!open) {
              setOpen(true);
              setActive(
                Math.max(
                  0,
                  visible.findIndex((m) => m.id === value),
                ),
              );
              e.currentTarget.select();
            }
          }}
          onFocus={(e) => {
            setOpen(true);
            setActive(
              Math.max(
                0,
                visible.findIndex((m) => m.id === value),
              ),
            );
            e.target.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (value) onSelect(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive(
                open
                  ? Math.max(
                      0,
                      Math.min(
                        visible.length - 1,
                        highlighted + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
                  : 0,
              );
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (visible[highlighted]) choose(visible[highlighted]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQuery(null);
            }
          }}
        />
        {(value || query) && (
          <button
            type="button"
            className="costing-picker-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelect(null);
              setQuery("");
              setOpen(true);
              setActive(0);
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
        {open && (
          <div className="costing-picker-popup">
            <div
              id={`${id}-options`}
              role="listbox"
              aria-label={`${label} matches`}
            >
              {visible.map((m, i) => (
                <button
                  ref={(element) => {
                    options.current[i] = element;
                  }}
                  id={`${id}-option-${i}`}
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={value === m.id}
                  className={i === highlighted ? "highlighted" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(m)}
                >
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.code} · {m.kind.toLowerCase()} · {m.unit_code}
                    </small>
                  </span>
                  {m.unitCost == null && (
                    <span className="costing-picker-status">
                      {m.kind === "PREPARED"
                        ? "Needs preparation cost"
                        : "Needs price"}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!visible.length && (
              <p role="status">No matching ingredients or packaging.</p>
            )}
            {matches.length > 60 && (
              <p role="status">
                Showing 60 of {matches.length} matches. Type more to narrow the
                results.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
