import { Pool } from "pg";

const cs = process.env.NEON_DATABASE_URL;
if (!cs) throw new Error("Missing NEON_DATABASE_URL");

export const pool = new Pool({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});
