// Pure connection policy. Never logs connection values or credentials.
export interface CostingTarget {
  mode: "local" | "production";
  host: string;
  port: number;
  user: string;
  database: string;
  password: string | undefined;
  expected: { db: string; port: number; uuid: string; dir?: string };
}
function required(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  if (!value)
    throw new Error(`Missing required database configuration: ${key}.`);
  return value;
}
export function resolveCostingTarget(
  env: Record<string, string | undefined>,
): CostingTarget {
  const mode = env.COSTING_DB_MODE ?? "local";
  if (mode !== "local" && mode !== "production")
    throw new Error("COSTING_DB_MODE must be local or production.");
  if (env.NODE_ENV === "production" && mode !== "production")
    throw new Error("Production requires explicit COSTING_DB_MODE=production.");
  const host = required(env, "DB_HOST"),
    portText = required(env, "DB_PORT"),
    user = required(env, "DB_USER"),
    database = required(env, "DB_NAME");
  if (
    !/^\d+$/.test(portText) ||
    Number(portText) < 1 ||
    Number(portText) > 65535
  )
    throw new Error("Invalid DB_PORT.");
  const port = Number(portText);
  if (mode === "local") {
    if (
      host !== "127.0.0.1" ||
      port !== 3306 ||
      user !== "membership_dev" ||
      database !== "membership_dev"
    )
      throw new Error(
        "Local costing requires the approved membership_dev database at 127.0.0.1:3306.",
      );
    return {
      mode,
      host,
      port,
      user,
      database,
      password: env.DB_PASSWORD,
      expected: {
        db: "membership_dev",
        port: 3306,
        uuid: "fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd",
        dir: "/opt/homebrew/var/mysql/",
      },
    };
  }
  const expectedName = required(env, "COSTING_DB_EXPECTED_NAME");
  const uuid = required(env, "COSTING_DB_EXPECTED_SERVER_UUID").toLowerCase();
  if (expectedName !== database)
    throw new Error("DB_NAME does not match COSTING_DB_EXPECTED_NAME.");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uuid))
    throw new Error("Invalid COSTING_DB_EXPECTED_SERVER_UUID.");
  if (uuid === "fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd")
    throw new Error("Production costing cannot target the development server.");
  return {
    mode,
    host,
    port,
    user,
    database,
    password: env.DB_PASSWORD,
    expected: { db: expectedName, port, uuid },
  };
}
export function matchesCostingTarget(
  identity: { db: unknown; port: unknown; uuid: unknown; dir?: unknown },
  target: CostingTarget,
): boolean {
  return (
    identity.db === target.expected.db &&
    Number(identity.port) === target.expected.port &&
    String(identity.uuid).toLowerCase() === target.expected.uuid &&
    (!target.expected.dir || identity.dir === target.expected.dir)
  );
}
