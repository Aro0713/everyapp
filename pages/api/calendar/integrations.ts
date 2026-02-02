import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
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

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `
        SELECT id, provider, name, ics_url, is_enabled, last_sync_at, last_error
        FROM calendar_integrations
        WHERE org_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        `,
        [officeId, userId]
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const name = mustString(body.name, "name");
      const icsUrl = mustString(body.icsUrl, "icsUrl");

      const { rows } = await pool.query(
        `
        INSERT INTO calendar_integrations (org_id, user_id, provider, name, ics_url)
        VALUES ($1, $2, 'ics', $3, $4)
        ON CONFLICT (user_id, ics_url) DO UPDATE
          SET name = EXCLUDED.name,
              is_enabled = true,
              updated_at = now()
        RETURNING id
        `,
        [officeId, userId, name, icsUrl]
      );

      return res.status(201).json({ id: rows[0].id });
    }

    if (req.method === "DELETE") {
      const id = mustString(req.query.id, "id");
      await pool.query(
        `DELETE FROM calendar_integrations WHERE id = $1 AND org_id = $2 AND user_id = $3`,
        [id, officeId, userId]
      );
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("CAL_INTEGRATIONS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
