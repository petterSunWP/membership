import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  costingRequest,
  emptyLibraries,
  errorMessage,
  money,
  costMoney,
  percentDisplay,
  type Libraries,
  type Location,
} from "./api";
import { ErrorBox, Field } from "./components";
import { Materials } from "./Materials";
import { Recipes } from "./Recipes";
import { ReferenceLibrary } from "./ReferenceLibrary";
import "./costing.css";
const tabs = [
  ["overview", "Overview"],
  ["raw", "Raw Ingredients"],
  ["prepared", "Prepared Ingredients"],
  ["packaging", "Packaging & Supplies"],
  ["recipes", "Drink Recipes"],
  ["options", "Toppings & Customisations"],
] as const;
export default function CostingPage() {
  const generation = useRef(0);
  const invalidateRequests = useCallback(() => {
    generation.current++;
  }, []);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "overview";
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState(
    localStorage.getItem("costing_location") ?? "",
  );
  const [data, setData] = useState<Libraries>(emptyLibraries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextLoaded, setContextLoaded] = useState(false);
  useEffect(() => {
    void costingRequest<{ locations: Location[] }>("/context")
      .then((c) => {
        setLocations(c.locations);
        setSelected((old) =>
          c.locations.some((l) => `${l.brandId}:${l.locationId}` === old)
            ? old
            : c.locations[0]
              ? `${c.locations[0].brandId}:${c.locations[0].locationId}`
              : "",
        );
        setContextLoaded(true);
        setLoading(false);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setContextLoaded(true);
        setLoading(false);
      });
  }, []);
  const location = locations.find(
    (l) => `${l.brandId}:${l.locationId}` === selected,
  );
  const base = location
    ? `/brands/${location.brandId}/locations/${location.locationId}`
    : "";
  const canEdit = Boolean(location && location.permission !== "VIEWER");
  const refresh = useCallback(async () => {
    if (!base) return;
    const requestGeneration = ++generation.current;
    const [materials, sizes, recipes, groups, options, products, profits] =
      await Promise.all([
        costingRequest<Libraries["materials"]>(`${base}/materials`),
        costingRequest<Libraries["sizes"]>(`${base}/sizes`),
        costingRequest<Libraries["recipes"]>(`${base}/recipes`),
        costingRequest<Libraries["groups"]>(`${base}/option-groups`),
        costingRequest<Libraries["options"]>(`${base}/options`),
        costingRequest<Libraries["products"]>(`${base}/products`),
        costingRequest<Libraries["profits"]>(`${base}/profitability`),
      ]);
    if (generation.current === requestGeneration) {
      setData({
        materials,
        sizes,
        recipes,
        groups,
        options,
        products,
        profits,
      });
      setError("");
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    if (base) {
      localStorage.setItem("costing_location", selected);
      void Promise.resolve()
        .then(refresh)
        .catch((e) => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      invalidateRequests();
    };
  }, [base, selected, refresh, invalidateRequests]);
  useEffect(() => {
    const update = () => {
      void refresh().catch((e) => setError(errorMessage(e)));
    };
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [refresh]);
  return (
    <div className="costing-app">
      <header className="costing-page-header">
        <div>
          <span className="costing-eyebrow">TEA TALK · RECIPE COSTING</span>
          <h1>Recipe Cost Management</h1>
          <p>From measured ingredients to a clear cost for every size.</p>
        </div>
        {locations.length > 0 && (
          <Field label="Brand / location">
            <select
              value={selected}
              onChange={(e) => {
                setLoading(true);
                setSelected(e.target.value);
              }}
            >
              {locations.map((l) => (
                <option
                  key={`${l.brandId}:${l.locationId}`}
                  value={`${l.brandId}:${l.locationId}`}
                >
                  {l.brandName} / {l.locationName} ·{" "}
                  {l.permission.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        )}
      </header>
      <ErrorBox message={error} />
      {contextLoaded && !locations.length && !error && (
        <div className="costing-card">
          <h2>Costing access has not been assigned</h2>
          <p>
            Ask your local costing administrator to grant access to TEA TALK
            Westgate. Your membership access remains available.
          </p>
        </div>
      )}
      {location && (
        <>
          <nav className="costing-tabs" aria-label="Recipe costing sections">
            {tabs.map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => setParams({ view: key })}
              >
                {label}
              </button>
            ))}
            {location.permission === "ADMIN" && (
              <button
                type="button"
                className={view === "access" ? "active" : ""}
                onClick={() => setParams({ view: "access" })}
              >
                Staff access
              </button>
            )}
          </nav>
          <div className="costing-status">
            <span>NZD · costs and revenue compared excluding GST</span>
            <button
              type="button"
              className="costing-quiet"
              onClick={() =>
                void refresh().catch((e) => setError(errorMessage(e)))
              }
            >
              Refresh current costs
            </button>
          </div>
          {loading ? (
            <div className="costing-empty">Loading costing libraries…</div>
          ) : (
            <div key={base}>
              {view === "overview" && <Overview base={base} data={data} />}{" "}
              {(["raw", "prepared", "packaging"] as string[]).includes(
                view,
              ) && (
                <Materials
                  key={view}
                  base={base}
                  data={data}
                  kind={
                    view === "raw"
                      ? "RAW"
                      : view === "prepared"
                        ? "PREPARED"
                        : "PACKAGING"
                  }
                  canEdit={canEdit}
                  refresh={refresh}
                />
              )}{" "}
              {view === "recipes" && (
                <Recipes
                  base={base}
                  data={data}
                  canEdit={canEdit}
                  refresh={refresh}
                />
              )}{" "}
              {view === "options" && (
                <>
                  <p className="costing-notice">
                    Create groups and options here, then attach portions and
                    recipe effects to individual drink sizes.
                  </p>
                  <div className="costing-two-columns">
                    <ReferenceLibrary
                      base={base}
                      type="option-groups"
                      data={data}
                      canEdit={canEdit}
                      refresh={refresh}
                    />
                    <ReferenceLibrary
                      base={base}
                      type="options"
                      data={data}
                      canEdit={canEdit}
                      refresh={refresh}
                    />
                  </div>
                </>
              )}
              {view === "access" && location.permission === "ADMIN" && (
                <Access base={base} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Overview({ base, data }: { base: string; data: Libraries }) {
  const [history, setHistory] = useState<
    | {
        id: string;
        action: string;
        entity_type: string;
        entity_id: string;
        created_at: string;
      }[]
    | null
  >(null);
  const [error, setError] = useState("");
  const missing = data.materials.filter(
    (m) => m.status === "ACTIVE" && m.unitCost === null,
  );
  return (
    <>
      <div className="costing-metrics costing-card">
        <div>
          <span>Active materials</span>
          <strong>
            {data.materials.filter((m) => m.status === "ACTIVE").length}
          </strong>
        </div>
        <div>
          <span>Drink size formulations</span>
          <strong>{data.profits.length}</strong>
        </div>
        <div>
          <span>Complete recipe costs</span>
          <strong>{data.profits.filter((p) => p.costing).length}</strong>
        </div>
        <div>
          <span>Materials needing costing</span>
          <strong>{missing.length}</strong>
        </div>
      </div>
      <section className="costing-card">
        <h2>Profitability by drink size</h2>
        <p className="costing-muted">
          Current prices and standard yields, with default customisations.
          Labour, rent and other overheads are excluded.
        </p>
        <table>
          <thead>
            <tr>
              <th>Drink / size</th>
              <th>Recipe cost · ex GST</th>
              <th>Revenue · ex GST</th>
              <th>Gross profit</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {data.profits.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small>{p.size}</small>
                </td>
                {p.costing ? (
                  <>
                    <td>{costMoney(p.costing.cost)}</td>
                    <td>{money(p.costing.revenue)}</td>
                    <td>{money(p.costing.grossProfit)}</td>
                    <td>
                      {p.costing.marginPercent === null
                        ? "Undefined"
                        : `${percentDisplay(p.costing.marginPercent)}%`}
                    </td>
                  </>
                ) : (
                  <td colSpan={4}>
                    <span className="costing-warning">
                      Incomplete: {p.error}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.profits.length && (
          <p className="costing-empty">
            Start with ingredients and packaging, then build your first drink
            size recipe.
          </p>
        )}
      </section>
      {missing.length > 0 && (
        <section className="costing-card">
          <h3>Finish material costing</h3>
          {missing.map((m) => (
            <p key={m.id}>
              <strong>{m.name}</strong> · {m.costError}
            </p>
          ))}
        </section>
      )}
      <section className="costing-card">
        <button
          type="button"
          className="costing-secondary"
          onClick={() =>
            void costingRequest<NonNullable<typeof history>>(`${base}/audit`)
              .then(setHistory)
              .catch((e) => setError(errorMessage(e)))
          }
        >
          Show recent change history
        </button>
        <ErrorBox message={error} />
        {history && (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Change</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.created_at}</td>
                  <td>{h.action.toLowerCase().replaceAll("_", " ")}</td>
                  <td>
                    {h.entity_type} #{h.entity_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
function Access({ base }: { base: string }) {
  type Staff = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  type Grant = { id: string; staff_user_id: string; permission: string };
  const [staff, setStaff] = useState<Staff[]>([]);
  const [access, setAccess] = useState<Grant[]>([]);
  const [chosen, setChosen] = useState("");
  const [permission, setPermission] = useState("VIEWER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      costingRequest<Staff[]>(`${base}/staff`),
      costingRequest<Grant[]>(`${base}/access`),
    ])
      .then(([s, a]) => {
        setStaff(s);
        setAccess(a);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [base]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await costingRequest(`${base}/access`, "POST", {
        staffId: chosen,
        permission,
      });
      setAccess(await costingRequest<Grant[]>(`${base}/access`));
      setChosen("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="costing-card">
      <h2>Staff costing access</h2>
      <p>
        Permissions apply only to this brand and location. Existing staff
        accounts and membership permissions are unchanged.
      </p>
      <table>
        <thead>
          <tr>
            <th>Staff</th>
            <th>Costing permission</th>
          </tr>
        </thead>
        <tbody>
          {access.map((a) => (
            <tr key={a.id}>
              <td>
                {staff.find((s) => s.id === a.staff_user_id)?.email ??
                  `Staff ${a.staff_user_id}`}
              </td>
              <td>{a.permission.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={submit}>
        <div className="costing-form-grid">
          <Field label="Existing staff account">
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              required
            >
              <option value="">Choose staff…</option>
              {staff
                .filter((s) => !access.some((a) => a.staff_user_id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} · {s.email}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Costing permission">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </Field>
        </div>
        <ErrorBox message={error} />
        <button disabled={busy}>Grant costing access</button>
      </form>
    </section>
  );
}
