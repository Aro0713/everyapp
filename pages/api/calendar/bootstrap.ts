import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // MVP: pass userId from client; docelowo: z sesji
    const userId = mustString(req.body?.userId, "userId");

    // 1) Find user's active office
    const m = await pool.query(
      `
      SELECT office_id
      FROM memberships
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [userId]
    );

    const officeId = m.rows[0]?.office_id;
    if (!officeId) {
      return res.status(404).json({ error: "No active office membership for user" });
    }

    // 2) Ensure ORG calendar exists for this office (calendar of the office)
    // We store it as owner_user_id = NULL (office-owned)
    await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      SELECT $1, NULL, 'Kalendarz biura', 'Europe/Warsaw', true
      WHERE NOT EXISTS (
        SELECT 1 FROM calendars
        WHERE org_id = $1 AND owner_user_id IS NULL AND is_default = true
      )
      `,
      [officeId]
    );

    const orgCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id IS NULL AND is_default = true
      LIMIT 1
      `,
      [officeId]
    );

    const orgCalendarId = orgCalRes.rows[0]?.id;

    // 3) Ensure USER calendar exists for this user in this office
    await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      SELECT $1, $2, 'Mój kalendarz', 'Europe/Warsaw', true
      WHERE NOT EXISTS (
        SELECT 1 FROM calendars
        WHERE org_id = $1 AND owner_user_id = $2 AND is_default = true
      )
      `,
      [officeId, userId]
    );

    const userCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id = $2 AND is_default = true
      LIMIT 1
      `,
      [officeId, userId]
    );

    const userCalendarId = userCalRes.rows[0]?.id;

    return res.status(200).json({
      officeId,
      orgCalendarId,
      userCalendarId,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
