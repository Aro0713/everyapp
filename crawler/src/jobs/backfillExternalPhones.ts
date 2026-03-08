import { Pool, type PoolClient } from "pg";
import { revealOtodomPhone } from "../enrichers/otodomPhone";
import { revealGratkaPhone } from "../enrichers/gratkaPhone";
import { revealOlxPhone } from "../enrichers/olxPhone";
import { revealMorizonPhone } from "../enrichers/morizonPhone";
import { revealOdWlascicielaPhone } from "../enrichers/odwlascicielaPhone";

type SupportedSource =
  | "otodom"
  | "olx"
  | "gratka"
  | "morizon"
  | "odwlasciciela";

type DbRow = {
  id: string;
  source: string;
  source_url: string;
};

type RevealPhoneResult = {
  ok: boolean;
  owner_phone?: string | null;
  method?: string | null;
  debug?: unknown;
};

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function optString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isSingleGratkaListingUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl || !sourceUrl.trim()) return false;
  return /\/(ob|oi)\/\d+(?:[/?#]|$)/i.test(sourceUrl);
}
function isSingleMorizonListingUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl || !sourceUrl.trim()) return false;
  return /\/oferta\/.+-mzn\d+\/?$/i.test(sourceUrl.trim());
}
function isSupportedSource(source: string): source is SupportedSource {
  return (
    source === "otodom" ||
    source === "olx" ||
    source === "gratka" ||
    source === "morizon" ||
    source === "odwlasciciela"
  );
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL / POSTGRES_URL / NEON_DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function revealPhoneBySource(source: SupportedSource, sourceUrl: string): Promise<RevealPhoneResult> {
    switch (source) {
    case "otodom":
      return revealOtodomPhone(sourceUrl);

    case "gratka":
      return revealGratkaPhone(sourceUrl);

    case "olx":
      return revealOlxPhone(sourceUrl);

    case "morizon":
      return revealMorizonPhone(sourceUrl);

    case "odwlasciciela":
      return revealOdWlascicielaPhone(sourceUrl);

    default:
      throw new Error(`Unsupported source: ${source}`);
  }
}

async function updateListingFoundPhone(
  client: PoolClient,
  rowId: string,
  phone: string,
  debugJson: string
) {
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
    [phone, debugJson, rowId]
  );
}

async function updateListingCheckedWithoutPhone(
  client: PoolClient,
  rowId: string,
  debugJson: string
) {
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
    [debugJson, rowId]
  );
}

async function main() {
  const limit = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_LIMIT) ?? 10, 1), 500);
  const delayMs = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_DELAY_MS) ?? 1500, 0), 15000);

  const onlyId =
    optString(process.env.EXTERNAL_PHONE_ONLY_ID) ??
    optString(process.env.ONLY_ID) ??
    null;

  const onlySourceRaw =
    optString(process.env.EXTERNAL_PHONE_SOURCE) ??
    optString(process.env.SOURCE) ??
    null;

  const onlySource =
    onlySourceRaw && isSupportedSource(onlySourceRaw)
      ? onlySourceRaw
      : null;

  if (onlySourceRaw && !onlySource) {
    console.error("EXTERNAL_PHONE_BACKFILL_INVALID_SOURCE", {
      onlySourceRaw,
      supported: ["otodom", "olx", "gratka", "morizon", "odwlasciciela"],
    });
    process.exit(1);
  }

  console.log("EXTERNAL_PHONE_BACKFILL_START", {
    limit,
    delayMs,
    onlyId,
    onlySource,
  });

  const client: PoolClient = await pool.connect();

  try {
    let rows: DbRow[] = [];

  if (onlyId) {
    const params: unknown[] = [onlyId];
    let sql = `
      SELECT id, source, source_url
      FROM external_listings
      WHERE id = $1
    `;

    if (onlySource) {
      params.push(onlySource);
      sql += ` AND source = $2`;

      if (onlySource === "gratka") {
        sql += ` AND source_url ~ '/(ob|oi)/[0-9]+'`;
      }

      if (onlySource === "morizon") {
        sql += ` AND source_url ~ '/oferta/.+-mzn[0-9]+/?$'`;
      }
    }

    sql += ` LIMIT 1`;

    const rowsRes = await client.query<DbRow>(sql, params);
    rows = rowsRes.rows ?? [];
  } else {
    const params: unknown[] = [];
    const where: string[] = [
      `COALESCE(source_status, 'active') <> 'removed'`,
      `(owner_phone IS NULL OR btrim(owner_phone) = '')`,
      `(source_url IS NOT NULL AND btrim(source_url) <> '')`,
      `source IN ('otodom', 'olx', 'gratka', 'morizon', 'odwlasciciela')`,
    ];

    if (onlySource) {
      params.push(onlySource);
      where.push(`source = $${params.length}`);

      if (onlySource === "gratka") {
        where.push(`source_url ~ '/(ob|oi)/[0-9]+'`);
      }

      if (onlySource === "morizon") {
        where.push(`source_url ~ '/oferta/.+-mzn[0-9]+/?$'`);
      }
    }

    params.push(limit);

    const sql = `
      SELECT id, source, source_url
      FROM external_listings
      WHERE ${where.join("\n          AND ")}
      ORDER BY last_checked_at ASC NULLS FIRST, enriched_at DESC NULLS LAST, updated_at DESC
      LIMIT $${params.length}
    `;

    const rowsRes = await client.query<DbRow>(sql, params);
    rows = rowsRes.rows ?? [];
    }

    if (!rows.length) {
      console.log("EXTERNAL_PHONE_BACKFILL_NOTHING_TO_DO");
      return;
    }

    let checked = 0;
    let found = 0;
    let notFound = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      checked += 1;

      if (!row.source_url || !row.source?.trim()) {
        skipped += 1;

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source ?? null,
          checkedAt: new Date().toISOString(),
          ok: false,
          error: "Missing source or source_url",
        });

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.warn("EXTERNAL_PHONE_SKIP_INVALID_ROW", {
          id: row.id,
          source: row.source,
          source_url: row.source_url,
          idx: checked,
          total: rows.length,
        });

        if (checked < rows.length && delayMs > 0) {
          await sleep(delayMs);
        }

        continue;
      }

      if (!isSupportedSource(row.source)) {
        skipped += 1;

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source,
          checkedAt: new Date().toISOString(),
          ok: false,
          error: `Unsupported source: ${row.source}`,
        });

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.warn("EXTERNAL_PHONE_SKIP_UNSUPPORTED_SOURCE", {
          id: row.id,
          source: row.source,
          idx: checked,
          total: rows.length,
        });

        if (checked < rows.length && delayMs > 0) {
          await sleep(delayMs);
        }

        continue;
      }
      if (row.source === "gratka" && !isSingleGratkaListingUrl(row.source_url)) {
        skipped += 1;

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source,
          checkedAt: new Date().toISOString(),
          ok: false,
          error: "Skipped non-single Gratka listing URL",
        });

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.warn("EXTERNAL_PHONE_SKIP_NON_SINGLE_GRATKA_URL", {
          id: row.id,
          source: row.source,
          source_url: row.source_url,
          idx: checked,
          total: rows.length,
        });

        if (checked < rows.length && delayMs > 0) {
          await sleep(delayMs);
        }

        continue;
      }
      if (row.source === "morizon" && !isSingleMorizonListingUrl(row.source_url)) {
        skipped += 1;

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source,
          checkedAt: new Date().toISOString(),
          ok: false,
          error: "Skipped non-single Morizon listing URL",
        });

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.warn("EXTERNAL_PHONE_SKIP_NON_SINGLE_MORIZON_URL", {
          id: row.id,
          source: row.source,
          source_url: row.source_url,
          idx: checked,
          total: rows.length,
        });

        if (checked < rows.length && delayMs > 0) {
          await sleep(delayMs);
        }

        continue;
      }

      console.log("EXTERNAL_PHONE_CHECK", {
        id: row.id,
        source: row.source,
        url: row.source_url,
        idx: checked,
        total: rows.length,
      });

      try {
        const result = await revealPhoneBySource(row.source, row.source_url);

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source,
          checkedAt: new Date().toISOString(),
          method: result.method ?? null,
          ok: result.ok,
          debug: result.debug ?? null,
        });

        if (result.ok && result.owner_phone) {
          found += 1;

          await updateListingFoundPhone(client, row.id, result.owner_phone, debugJson);

          console.log("EXTERNAL_PHONE_FOUND", {
            id: row.id,
            source: row.source,
            phone: result.owner_phone,
            method: result.method ?? null,
          });
        } else {
          notFound += 1;

          await updateListingCheckedWithoutPhone(client, row.id, debugJson);

          console.log("EXTERNAL_PHONE_NOT_FOUND", {
            id: row.id,
            source: row.source,
            method: result.method ?? null,
          });
        }
      } catch (error: any) {
        failed += 1;

        const debugJson = JSON.stringify({
          source: "external-phone-worker",
          portal: row.source,
          checkedAt: new Date().toISOString(),
          ok: false,
          error: error?.message ?? "Unknown error",
        });

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.error("EXTERNAL_PHONE_ERROR", {
          id: row.id,
          source: row.source,
          error: error?.message ?? error,
        });
      }

      if (checked < rows.length && delayMs > 0) {
        await sleep(delayMs);
      }
    }

    console.log("EXTERNAL_PHONE_BACKFILL_DONE", {
      checked,
      found,
      notFound,
      failed,
      skipped,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("EXTERNAL_PHONE_BACKFILL_FATAL", error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});