import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUser(userId);
    if (!officeId) return res.status(404).json({ error: "No active office membership" });

    const start = optString(req.query.start);
    const end = optString(req.query.end);

    const { rows } = await pool.query(
      `
      SELECT e.id, e.integration_id, e.title, e.description, e.location_text, e.start_at, e.end_at
      FROM calendar_external_events e
      JOIN calendar_integrations i ON i.id = e.integration_id
      WHERE i.org_id = $1
        AND i.user_id = $2
        AND i.is_enabled = true
        AND ($3::timestamptz IS NULL OR e.end_at   > $3::timestamptz OR e.end_at IS NULL)
        AND ($4::timestamptz IS NULL OR e.start_at < $4::timestamptz)
      ORDER BY e.start_at ASC
      `,
      [officeId, userId, start, end]
    );

    return res.status(200).json(
      rows.map((r) => ({
        id: `ext:${r.id}`,
        title: r.title ?? "",
        start: r.start_at,
        end: r.end_at,
        editable: false,
        extendedProps: {
          source: "ics",
          integrationId: r.integration_id,
          description: r.description ?? null,
          locationText: r.location_text ?? null,
        },
      }))
    );
  } catch (e: any) {
    console.error("CAL_EXTERNAL_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
