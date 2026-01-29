import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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

    const officeId: string | null = m.rows[0]?.office_id ?? null;
    if (!officeId) {
      return res.status(404).json({ error: "No active office membership for user" });
    }

    // 2) Ensure ORG calendar exists (office-owned, owner_user_id NULL)
    // IMPORTANT: do NOT depend on is_default=true for existence
    await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      SELECT $1, NULL, 'Kalendarz biura', 'Europe/Warsaw', true
      WHERE NOT EXISTS (
        SELECT 1 FROM calendars
        WHERE org_id = $1 AND owner_user_id IS NULL
      )
      `,
      [officeId]
    );

    // Prefer default, but fall back to any office-owned calendar
    const orgCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id IS NULL
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
      `,
      [officeId]
    );

    let orgCalendarId: string | null = orgCalRes.rows[0]?.id ?? null;

    // If somehow still null, hard-fail with clear message
    if (!orgCalendarId) {
      return res.status(500).json({ error: "Office calendar missing after ensure" });
    }

    // 3) Ensure USER calendar exists (owner_user_id=userId)
    await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      SELECT $1, $2, 'Mój kalendarz', 'Europe/Warsaw', true
      WHERE NOT EXISTS (
        SELECT 1 FROM calendars
        WHERE org_id = $1 AND owner_user_id = $2
      )
      `,
      [officeId, userId]
    );

    const userCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id = $2
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
      `,
      [officeId, userId]
    );

    let userCalendarId: string | null = userCalRes.rows[0]?.id ?? null;

    // Optional: if you have column "scope", try to set it (non-fatal)
    // This avoids UI confusion when you later rely on scope.
    try {
      await pool.query(
        `
        UPDATE calendars
        SET scope = CASE
          WHEN owner_user_id IS NULL THEN 'org'
          ELSE 'user'
        END
        WHERE org_id = $1
        `,
        [officeId]
      );
    } catch {
      // ignore if column doesn't exist or can't be updated
    }

    // Optional: enforce exactly one default per org for office calendar (non-fatal)
    // If you had duplicates earlier, this stabilizes future selections.
    try {
      await pool.query(
        `
        UPDATE calendars
        SET is_default = (id = $2)
        WHERE org_id = $1 AND owner_user_id IS NULL
        `,
        [officeId, orgCalendarId]
      );
    } catch {
      // ignore if constraints prevent it
    }

    return res.status(200).json({
      officeId,
      orgCalendarId,
      userCalendarId,
    });
  } catch (e: any) {
    console.error("CAL_BOOTSTRAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
