import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";

async function tryAcquireOfficeLock(officeId: string): Promise<boolean> {
  const k = `everybot_verify:${officeId}`;
  const { rows } = await pool.query<{ ok: boolean }>(
    `select pg_try_advisory_lock(hashtext($1)) as ok`,
    [k]
  );
  return rows?.[0]?.ok === true;
}

async function releaseOfficeLock(officeId: string): Promise<void> {
  const k = `everybot_verify:${officeId}`;
  await pool.query(`select pg_advisory_unlock(hashtext($1))`, [k]).catch(() => null);
}

type Row = { id: string; office_id: string; source_url: string };

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

    const limit = typeof req.body?.limit === "number" ? req.body.limit : 100;

    const { rows } = await pool.query<Row>(
      `
      select id, office_id, source_url
      from external_listings
      where status = 'enriched'
      order by updated_at asc
      limit $1
      `,
      [limit]
    );

    if (!rows.length) return res.status(200).json({ ok: true, processed: 0 });

    const byOffice = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byOffice.get(r.office_id) ?? [];
      arr.push(r);
      byOffice.set(r.office_id, arr);
    }

    let processed = 0;

    for (const [officeId, items] of byOffice.entries()) {
      const gotLock = await tryAcquireOfficeLock(officeId);
      if (!gotLock) continue;

      try {
        for (const it of items) {
          // TODO: Twoja logika verify (np. sprawdź czy URL nadal żyje)
          await pool.query(
            `update external_listings set status='active', updated_at=now() where id=$1`,
            [it.id]
          );
          processed++;
        }
      } finally {
        await releaseOfficeLock(officeId);
      }
    }

    return res.status(200).json({ ok: true, processed });
  } catch (e: any) {
    console.error("EVERYBOT_VERIFY_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
