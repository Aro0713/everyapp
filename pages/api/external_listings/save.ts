// pages/api/external_listings/save.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const body = req.body ?? {};
    const externalListingId = optString(body.external_listing_id);
    const mode = optString(body.mode) ?? "agent"; // "agent" | "office"
    const note = optString(body.note);

    if (!externalListingId) {
      return res.status(400).json({ error: "Missing external_listing_id" });
    }

    // agent => user_id = current user
    // office => user_id = null
    const userIdToSave = mode === "office" ? null : userId;

    // idempotent: nie duplikuj tego samego zapisu
    const sql = `
    INSERT INTO external_listing_actions (
        office_id, external_listing_id, user_id, action, note
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (office_id, external_listing_id, user_id)
    DO UPDATE SET
        action = EXCLUDED.action,
        note = COALESCE(EXCLUDED.note, external_listing_actions.note),
        updated_at = now()
    RETURNING id
    `;

     const action = "save";

    const { rows } = await pool.query<{ id: string }>(sql, [
    officeId,
    externalListingId,
    userIdToSave,
    action,
    note,
    ]);

    return res.status(200).json({ ok: true, id: rows?.[0]?.id ?? null });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_SAVE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
