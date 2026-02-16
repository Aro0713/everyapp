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
   if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
        }

        const ua = String(req.headers["user-agent"] || "");
        const auth = String(req.headers["authorization"] || "");
        const secret = process.env.EVERYBOT_CRON_SECRET || "";

        const okCronUa = ua.startsWith("vercel-cron");
        const okBearer = !!secret && auth === `Bearer ${secret}`;

        if (!okCronUa && !okBearer) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
        }

    const limit = 100;

        const { rows } = await pool.query<Row>(
        `
        select id, office_id, source_url
        from external_listings
        where
            status in ('preview','active','enriched')
            and source_url is not null
            and source_url <> ''
            and (
            last_checked_at is null
            or last_checked_at < now() - interval '6 hours'
            )
        order by
            -- najpierw nigdy nie sprawdzane
            (last_checked_at is null) desc,
            -- potem najdawniej sprawdzane
            last_checked_at asc nulls first,
            -- i dopiero potem "świeżość" rekordu
            updated_at desc
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
            `
            update external_listings
            set
                last_checked_at = now(),
                last_seen_at = coalesce(last_seen_at, now()),
                source_status = coalesce(source_status, 'active'),
                updated_at = now()
            where id = $1
            `,
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
