import { Pool } from "pg";
import { revealOtodomPhone } from "../enrichers/otodomPhone";

type DbRow = {
  id: string;
  source_url: string;
};

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL / POSTGRES_URL / NEON_DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const limit = Math.min(Math.max(optNumber(process.env.OTODOM_PHONE_LIMIT) ?? 10, 1), 100);
  const delayMs = Math.min(Math.max(optNumber(process.env.OTODOM_PHONE_DELAY_MS) ?? 1500, 0), 15000);
  const onlyId = process.env.OTODOM_PHONE_ID?.trim() || null;

  console.log("OTODOM_PHONE_BACKFILL_START", {
    limit,
    delayMs,
    onlyId,
  });

  const client = await pool.connect();

  try {
    const sql = onlyId
      ? `
        SELECT id, source_url
        FROM external_listings
        WHERE source = 'otodom'
          AND id = $1
        LIMIT 1
      `
      : `
        SELECT id, source_url
        FROM external_listings
        WHERE source = 'otodom'
          AND COALESCE(source_status, 'active') <> 'removed'
          AND (owner_phone IS NULL OR btrim(owner_phone) = '')
        ORDER BY enriched_at DESC NULLS LAST, updated_at DESC
        LIMIT $1
      `;

    const rowsRes = await client.query<DbRow>(sql, [onlyId ?? limit]);
    const rows = rowsRes.rows ?? [];

    if (!rows.length) {
      console.log("OTODOM_PHONE_BACKFILL_NOTHING_TO_DO");
      return;
    }

    let checked = 0;
    let found = 0;
    let notFound = 0;
    let failed = 0;

    for (const row of rows) {
      checked += 1;

      console.log("OTODOM_PHONE_CHECK", {
        id: row.id,
        url: row.source_url,
        idx: checked,
        total: rows.length,
      });

      try {
        const result = await revealOtodomPhone(row.source_url);

        const debugJson = JSON.stringify({
          source: "otodom-phone-worker",
          checkedAt: new Date().toISOString(),
          method: result.method,
          ok: result.ok,
          debug: result.debug ?? null,
        });

        if (result.ok && result.owner_phone) {
          found += 1;

          await client.query(
            `
            UPDATE external_listings
            SET
              owner_phone = $1,
              raw = CASE
                      WHEN raw IS NULL OR raw = '{}'::jsonb THEN $2::jsonb
                      ELSE raw || $2::jsonb
                    END,
              updated_at = now(),
              last_checked_at = now()
            WHERE id = $3
            `,
            [result.owner_phone, debugJson, row.id]
          );

          console.log("OTODOM_PHONE_FOUND", {
            id: row.id,
            phone: result.owner_phone,
            method: result.method,
          });
        } else {
          notFound += 1;

          await client.query(
            `
            UPDATE external_listings
            SET
              raw = CASE
                      WHEN raw IS NULL OR raw = '{}'::jsonb THEN $1::jsonb
                      ELSE raw || $1::jsonb
                    END,
              last_checked_at = now(),
              updated_at = now()
            WHERE id = $2
            `,
            [debugJson, row.id]
          );

          console.log("OTODOM_PHONE_NOT_FOUND", {
            id: row.id,
            method: result.method,
          });
        }
      } catch (error: any) {
        failed += 1;

        const debugJson = JSON.stringify({
          source: "otodom-phone-worker",
          checkedAt: new Date().toISOString(),
          ok: false,
          error: error?.message ?? "Unknown error",
        });

        await client.query(
          `
          UPDATE external_listings
          SET
            raw = CASE
                    WHEN raw IS NULL OR raw = '{}'::jsonb THEN $1::jsonb
                    ELSE raw || $1::jsonb
                  END,
            last_checked_at = now(),
            updated_at = now()
          WHERE id = $2
          `,
          [debugJson, row.id]
        );

        console.error("OTODOM_PHONE_ERROR", {
          id: row.id,
          error: error?.message ?? error,
        });
      }

      if (checked < rows.length && delayMs > 0) {
        await sleep(delayMs);
      }
    }

    console.log("OTODOM_PHONE_BACKFILL_DONE", {
      checked,
      found,
      notFound,
      failed,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("OTODOM_PHONE_BACKFILL_FATAL", error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});