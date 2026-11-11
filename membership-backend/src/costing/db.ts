import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { resolveCostingTarget } from "./target.js";
// Match the application's existing backend working directory and environment.
// Already configured process/service variables take precedence over .env values.
dotenv.config({ quiet: true });
export const costingTarget = resolveCostingTarget(process.env);
export const costingDb = mysql.createPool({
  host: costingTarget.host,
  port: costingTarget.port,
  user: costingTarget.user,
  database: costingTarget.database,
  password: costingTarget.password,
  connectionLimit: 5,
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: false,
  dateStrings: true,
  jsonStrings: true,
  multipleStatements: false,
  charset: "utf8mb4",
});
