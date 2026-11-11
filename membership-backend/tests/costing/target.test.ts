import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCostingTarget,
  matchesCostingTarget,
} from "../../src/costing/target.js";
const local = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_USER: "membership_dev",
  DB_NAME: "membership_dev",
};
const production = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_USER: "app_user",
  DB_NAME: "membership_live",
  NODE_ENV: "production",
  COSTING_DB_MODE: "production",
  COSTING_DB_EXPECTED_NAME: "membership_live",
  COSTING_DB_EXPECTED_SERVER_UUID: "11111111-2222-4333-8444-555555555555",
};
test("default local target retains all original local identity protections", () => {
  const target = resolveCostingTarget(local);
  assert.equal(target.mode, "local");
  assert.ok(
    matchesCostingTarget(
      {
        db: "membership_dev",
        port: "3306",
        uuid: "fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd",
        dir: "/opt/homebrew/var/mysql/",
      },
      target,
    ),
  );
  for (const patch of [
    { DB_HOST: "remote" },
    { DB_NAME: "membership_live" },
    { DB_PORT: "3307" },
    { DB_USER: "root" },
    { NODE_ENV: "production" },
    { COSTING_DB_MODE: "other" },
  ])
    assert.throws(() => resolveCostingTarget({ ...local, ...patch }));
});
test("production requires explicitly pinned database and server identity", () => {
  const target = resolveCostingTarget(production);
  assert.ok(
    matchesCostingTarget(
      {
        db: "membership_live",
        port: 3306,
        uuid: production.COSTING_DB_EXPECTED_SERVER_UUID,
      },
      target,
    ),
  );
  assert.ok(
    !matchesCostingTarget(
      {
        db: "other",
        port: 3306,
        uuid: production.COSTING_DB_EXPECTED_SERVER_UUID,
      },
      target,
    ),
  );
  assert.ok(
    !matchesCostingTarget(
      { db: "membership_live", port: 3306, uuid: "other" },
      target,
    ),
  );
  assert.ok(
    !matchesCostingTarget(
      {
        db: "membership_live",
        port: 3307,
        uuid: production.COSTING_DB_EXPECTED_SERVER_UUID,
      },
      target,
    ),
  );
  assert.doesNotThrow(() =>
    resolveCostingTarget({
      ...production,
      DB_NAME: "membership_dev",
      COSTING_DB_EXPECTED_NAME: "membership_dev",
    }),
  );
  for (const patch of [
    { COSTING_DB_EXPECTED_NAME: undefined },
    { COSTING_DB_EXPECTED_SERVER_UUID: undefined },
    { COSTING_DB_EXPECTED_NAME: "wrong" },
    { COSTING_DB_EXPECTED_SERVER_UUID: "invalid" },
    { DB_PORT: "NaN" },
    { DB_PORT: "70000" },
    { COSTING_DB_EXPECTED_SERVER_UUID: "fb988fbc-a5ae-11f1-875e-7c8a3f9c54cd" },
  ])
    assert.throws(() => resolveCostingTarget({ ...production, ...patch }));
});
test("configuration errors never expose passwords", () => {
  try {
    resolveCostingTarget({
      ...production,
      DB_PASSWORD: "synthetic-secret",
      COSTING_DB_EXPECTED_NAME: undefined,
    });
    assert.fail("Expected validation error");
  } catch (error) {
    assert.doesNotMatch(String(error), /synthetic-secret/);
  }
});
