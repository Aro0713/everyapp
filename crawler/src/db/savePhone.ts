import { Pool } from "pg";

const connectionString = process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing environment variable: NEON_DATABASE_URL");
}

const globalForPg = globalThis as typeof globalThis & {
  __everyappCrawlerPgPool?: Pool;
};

export const pool =
  globalForPg.__everyappCrawlerPgPool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });

if (!globalForPg.__everyappCrawlerPgPool) {
  globalForPg.__everyappCrawlerPgPool = pool;
}

export function normalizePhoneForDb(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  const fromTel = trimmed.replace(/^tel:/i, "");
  const normalized = fromTel.replace(/[^\d+]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");

  if (digitsOnly.length < 9 || digitsOnly.length > 15) {
    return null;
  }

  if (normalized.startsWith("+")) return normalized;
  if (digitsOnly.length === 9) return `+48${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("48")) return `+${digitsOnly}`;

  return `+${digitsOnly}`;
}

export async function savePhoneForListing(args: {
  sourceUrl: string;
  phoneRaw: string;
  source?: string | null;
}): Promise<{
  updated: boolean;
  phone: string | null;
  rowCount: number;
}> {
  const phone = normalizePhoneForDb(args.phoneRaw);

  if (!phone) {
    return { updated: false, phone: null, rowCount: 0 };
  }

  const sql = `
    UPDATE external_listings
    SET
      phone = $1,
      phone_revealed_at = NOW(),
      updated_at = NOW()
    WHERE source_url = $2
      AND ($3::text IS NULL OR source = $3::text)
  `;

  const result = await pool.query(sql, [
    phone,
    args.sourceUrl,
    args.source ?? null,
  ]);

  const rowCount = result.rowCount ?? 0;

  return {
    updated: rowCount > 0,
    phone,
    rowCount,
  };
}

export async function closePhoneDb(): Promise<void> {
  await pool.end();
}