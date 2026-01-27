import { Pool } from "pg";

const connectionString = process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing NEON_DATABASE_URL in .env.local");
}

// Pool w Next.js jest OK, pod warunkiem że trzymamy go w singletonie
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
