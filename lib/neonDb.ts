import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL in environment");
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
