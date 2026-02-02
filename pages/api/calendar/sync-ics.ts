import type { NextApiRequest, NextApiResponse } from "next";
import ical from "node-ical";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

async function getOfficeIdForUser(userId: string) {
  const m = await pool.query(
    `
    SELECT office_id
    FROM memberships
    WHERE user_id = $1 AND status = 'active'
    ORDER BY (role = 'owner') DESC, created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return (m.rows[0]?.office_id as string | null) ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // allow: session user OR cron secret
    const cronKey = typeof req.query.key === "string" ? req.query.key : null;
    const userId = getUserIdFromRequest(req);

    if (!userId && cronKey !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    // If cron: sync all enabled integrations. If user: sync only their integrations.
    const whereUser = userId ? "AND user_id = $2" : "";
    const params = userId ? [await getOfficeIdForUser(userId), userId] : [null];

    if (userId) {
      const officeId = await getOfficeIdForUser(userId);
      if (!officeId) return res.status(404).json({ error: "No active office membership" });

      const { rows: ints } = await pool.query(
        `
        SELECT id, org_id, user_id, ics_url
        FROM calendar_integrations
        WHERE org_id = $1 AND user_id = $2 AND provider = 'ics' AND is_enabled = true
        `,
        [officeId, userId]
      );

      const out: any[] = [];
      for (const it of ints) {
        out.push(await syncOne(it.id, it.org_id, it.ics_url));
      }
      return res.status(200).json({ ok: true, results: out });
    }

    // cron mode: sync all enabled (careful: if you have many users, consider batching)
    const { rows: ints } = await pool.query(
      `
      SELECT id, org_id, user_id, ics_url
      FROM calendar_integrations
      WHERE provider = 'ics' AND is_enabled = true
      `
    );

    const out: any[] = [];
    for (const it of ints) {
      out.push(await syncOne(it.id, it.org_id, it.ics_url));
    }
    return res.status(200).json({ ok: true, results: out });
  } catch (e: any) {
    console.error("CAL_SYNC_ICS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

async function syncOne(integrationId: string, orgId: string, icsUrl: string) {
  try {
  const resp = await fetch(icsUrl);
if (!resp.ok) throw new Error(`ICS fetch failed: ${resp.status}`);

const icsText = await resp.text();
const data = ical.parseICS(icsText);

const events = Object.values(data).filter((x: any) => x && x.type === "VEVENT") as any[];

    // upsert each
    for (const ev of events) {
      const uid = String(ev.uid ?? ev.id ?? "");
      if (!uid) continue;

      const start = ev.start ? new Date(ev.start) : null;
      const end = ev.end ? new Date(ev.end) : null;
      if (!start) continue;

      const title = String(ev.summary ?? "");
      const description = ev.description ? String(ev.description) : null;
      const locationText = ev.location ? String(ev.location) : null;

      await pool.query(
        `
        INSERT INTO calendar_external_events
          (org_id, integration_id, external_uid, title, description, location_text, start_at, end_at, raw, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb, now())
        ON CONFLICT (integration_id, external_uid, start_at)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location_text = EXCLUDED.location_text,
          end_at = EXCLUDED.end_at,
          raw = EXCLUDED.raw,
          updated_at = now()
        `,
        [orgId, integrationId, uid, title, description, locationText, start.toISOString(), end ? end.toISOString() : null, JSON.stringify(ev)]
      );
    }

    await pool.query(
      `
      UPDATE calendar_integrations
      SET last_sync_at = now(), last_error = NULL, updated_at = now()
      WHERE id = $1
      `,
      [integrationId]
    );

    return { integrationId, ok: true, imported: events.length };
  } catch (e: any) {
    await pool.query(
      `
      UPDATE calendar_integrations
      SET last_sync_at = now(), last_error = $2, updated_at = now()
      WHERE id = $1
      `,
      [integrationId, String(e?.message ?? e)]
    );
    return { integrationId, ok: false, error: String(e?.message ?? e) };
  }
}
