import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { enrichRegistry, type SourceKey } from "../../../lib/everybot/enrichers";

async function tryAcquireOfficeLock(officeId: string): Promise<boolean> {
  const k = `everybot_enrich:${officeId}`;
  const { rows } = await pool.query<{ ok: boolean }>(
    `select pg_try_advisory_lock(hashtext($1)) as ok`,
    [k]
  );
  return rows?.[0]?.ok === true;
}

async function releaseOfficeLock(officeId: string): Promise<void> {
  const k = `everybot_enrich:${officeId}`;
  await pool.query(`select pg_advisory_unlock(hashtext($1))`, [k]).catch(() => null);
}

type Row = {
  id: string;
  office_id: string;
  source: SourceKey;
  source_url: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ✅ Vercel Cron auth (bez sekretów w repo)
    const ua = String(req.headers["user-agent"] || "");
    if (!ua.startsWith("vercel-cron")) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const limit = typeof req.body?.limit === "number" ? req.body.limit : 50;

    const { rows } = await pool.query<Row>(
      `
      select id, office_id, source, source_url
      from external_listings
      where status = 'preview'
      order by updated_at asc
      limit $1
      `,
      [limit]
    );

    if (!rows.length) {
      return res.status(200).json({ ok: true, processed: 0, errors: [] });
    }

    const byOffice = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byOffice.get(r.office_id) ?? [];
      arr.push(r);
      byOffice.set(r.office_id, arr);
    }

    let processed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const [officeId, items] of byOffice.entries()) {
      const gotLock = await tryAcquireOfficeLock(officeId);
      if (!gotLock) continue;

      try {
        for (const it of items) {
          try {
            const enricher = enrichRegistry[it.source];
            if (!enricher) throw new Error(`No enricher for source=${it.source}`);

            const data = await enricher(it.source_url);

            await pool.query(
              `
              update external_listings
              set
                title = coalesce($2, title),
                price_amount = coalesce($3, price_amount),
                currency = coalesce($4, currency),
                location_text = coalesce($5, location_text),
                thumb_url = coalesce($6, thumb_url),
                status = 'enriched',
                updated_at = now()
              where id = $1
              `,
              [
                it.id,
                data?.title ?? null,
                data?.price_amount ?? null,
                data?.currency ?? null,
                data?.location_text ?? null,
                data?.thumb_url ?? null,
              ]
            );

            processed++;
          } catch (e: any) {
            errors.push({ id: it.id, error: e?.message ?? String(e) });
            await pool
              .query(`update external_listings set status='error', updated_at=now() where id=$1`, [
                it.id,
              ])
              .catch(() => null);
          }
        }
      } finally {
        await releaseOfficeLock(officeId);
      }
    }

    return res.status(200).json({ ok: true, processed, errors });
  } catch (e: any) {
    console.error("EVERYBOT_ENRICH_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
