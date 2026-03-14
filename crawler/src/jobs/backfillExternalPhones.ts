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
  enrich_attempts: number | null;
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

function nowIso() {
  return new Date().toISOString();
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
      phone = $1,
      phone_revealed_at = now(),
      enriched_at = now(),
      enrich_attempts = COALESCE(enrich_attempts, 0) + 1,
      raw = CASE
              WHEN raw IS NULL OR raw = '{}'::jsonb THEN $2::jsonb
              ELSE raw || $2::jsonb
            END,
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
      enrich_attempts = COALESCE(enrich_attempts, 0) + 1,
      raw = CASE
              WHEN raw IS NULL OR raw = '{}'::jsonb THEN $1::jsonb
              ELSE raw || $1::jsonb
            END,
      last_checked_at = now()
    WHERE id = $2
    `,
    [debugJson, rowId]
  );
}

async function deleteListing(client: PoolClient, rowId: string, reason: string, meta?: unknown) {
  await client.query(
    `
    DELETE FROM external_listings
    WHERE id = $1
    `,
    [rowId]
  );

  console.warn("EXTERNAL_PHONE_DELETE", {
    id: rowId,
    reason,
    meta: meta ?? null,
  });
}

async function fetchBatch(
  client: PoolClient,
  limit: number,
  onlyId: string | null,
  onlySource: SupportedSource | null
): Promise<DbRow[]> {
  if (onlyId) {
    const params: unknown[] = [onlyId];
    let sql = `
      SELECT id, source, source_url, enrich_attempts
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
    return rowsRes.rows ?? [];
  }

  const params: unknown[] = [];
  const where: string[] = [
    `COALESCE(source_status, 'active') <> 'removed'`,
    `(COALESCE(owner_phone, '') = '' AND COALESCE(phone, '') = '')`,
    `(source_url IS NOT NULL AND btrim(source_url) <> '')`,
    `(last_checked_at IS NULL OR last_checked_at < now() - interval '2 hours')`,
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
    SELECT id, source, source_url, enrich_attempts
    FROM external_listings
    WHERE ${where.join("\n      AND ")}
    ORDER BY
      COALESCE(enrich_attempts, 0) ASC,
      last_checked_at NULLS FIRST,
      enriched_at DESC NULLS LAST,
      updated_at DESC
    LIMIT $${params.length}
  `;

  const rowsRes = await client.query<DbRow>(sql, params);
  return rowsRes.rows ?? [];
}

async function processBatch(
  client: PoolClient,
  rows: DbRow[],
  delayMs: number,
  maxAttempts: number
) {
  let checked = 0;
  let found = 0;
  let notFound = 0;
  let failed = 0;
  let skipped = 0;
  let deleted = 0;

  for (const row of rows) {
    checked += 1;
    const currentAttempts = row.enrich_attempts ?? 0;

    if (!row.source_url || !row.source?.trim()) {
      skipped += 1;
      deleted += 1;

      await deleteListing(client, row.id, "invalid_row_missing_source_or_url", {
        source: row.source ?? null,
        source_url: row.source_url ?? null,
      });

      if (checked < rows.length && delayMs > 0) {
        await sleep(delayMs);
      }
      continue;
    }

    if (!isSupportedSource(row.source)) {
      skipped += 1;
      deleted += 1;

      await deleteListing(client, row.id, "unsupported_source", {
        source: row.source,
      });

      if (checked < rows.length && delayMs > 0) {
        await sleep(delayMs);
      }
      continue;
    }

    if (row.source === "gratka" && !isSingleGratkaListingUrl(row.source_url)) {
      skipped += 1;
      deleted += 1;

      await deleteListing(client, row.id, "non_single_gratka_url", {
        source_url: row.source_url,
      });

      if (checked < rows.length && delayMs > 0) {
        await sleep(delayMs);
      }
      continue;
    }

    if (row.source === "morizon" && !isSingleMorizonListingUrl(row.source_url)) {
      skipped += 1;
      deleted += 1;

      await deleteListing(client, row.id, "non_single_morizon_url", {
        source_url: row.source_url,
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
      attempts: currentAttempts,
      idx: checked,
      total: rows.length,
    });

    try {
      const result = await revealPhoneBySource(row.source, row.source_url);

      const debugJson = JSON.stringify({
        source: "external-phone-worker",
        portal: row.source,
        checkedAt: nowIso(),
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

        const nextAttempts = currentAttempts + 1;

        await updateListingCheckedWithoutPhone(client, row.id, debugJson);

        console.log("EXTERNAL_PHONE_NOT_FOUND", {
          id: row.id,
          source: row.source,
          method: result.method ?? null,
          attempts: nextAttempts,
          maxAttempts,
        });

        if (nextAttempts >= maxAttempts) {
          await deleteListing(client, row.id, "max_attempts_without_phone", {
            source: row.source,
            source_url: row.source_url,
            attempts: nextAttempts,
          });
          deleted += 1;
        }
      }
    } catch (error: any) {
      failed += 1;

      const debugJson = JSON.stringify({
        source: "external-phone-worker",
        portal: row.source,
        checkedAt: nowIso(),
        ok: false,
        error: error?.message ?? "Unknown error",
      });

      const nextAttempts = currentAttempts + 1;

      await updateListingCheckedWithoutPhone(client, row.id, debugJson);

      console.error("EXTERNAL_PHONE_ERROR", {
        id: row.id,
        source: row.source,
        error: error?.message ?? error,
        attempts: nextAttempts,
        maxAttempts,
      });

      if (nextAttempts >= maxAttempts) {
        await deleteListing(client, row.id, "max_attempts_with_errors", {
          source: row.source,
          source_url: row.source_url,
          attempts: nextAttempts,
          error: error?.message ?? "Unknown error",
        });
        deleted += 1;
      }
    }

    if (checked < rows.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { checked, found, notFound, failed, skipped, deleted };
}

async function main() {
  const limit = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_LIMIT) ?? 500, 1), 500);
  const delayMs = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_DELAY_MS) ?? 1200, 0), 15000);
  const cycleDelayMs = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_CYCLE_DELAY_MS) ?? 10000, 1000), 600000);
  const maxAttempts = Math.min(Math.max(optNumber(process.env.EXTERNAL_PHONE_MAX_ATTEMPTS) ?? 3, 1), 10);

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

  console.log("EXTERNAL_PHONE_BACKFILL_LOOP_START", {
    limit,
    delayMs,
    cycleDelayMs,
    maxAttempts,
    onlyId,
    onlySource,
  });

  const client: PoolClient = await pool.connect();

  try {
    while (true) {
      const rows = await fetchBatch(client, limit, onlyId, onlySource);

      if (!rows.length) {
        console.log("EXTERNAL_PHONE_BACKFILL_IDLE", {
          checkedAt: nowIso(),
          sleepMs: cycleDelayMs,
        });
        await sleep(cycleDelayMs);
        continue;
      }

      const stats = await processBatch(client, rows, delayMs, maxAttempts);

      console.log("EXTERNAL_PHONE_BACKFILL_BATCH_DONE", {
        ...stats,
        batchSize: rows.length,
        sleepMs: cycleDelayMs,
      });

      if (onlyId) {
        console.log("EXTERNAL_PHONE_BACKFILL_SINGLE_DONE");
        break;
      }

      await sleep(cycleDelayMs);
    }
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