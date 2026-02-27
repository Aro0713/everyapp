// pages/api/external_listings/save.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type ListingAction = "save" | "reject" | "call" | "visit";

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
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const body = req.body ?? {};
    const externalListingId = optString(body.external_listing_id);
    const mode = optString(body.mode) ?? "agent"; // "agent" | "office"
    const note = optString(body.note);

    if (!externalListingId) {
      return res.status(400).json({ error: "Missing external_listing_id" });
    }

    const allowedActions: ListingAction[] = ["save", "reject", "call", "visit"];
    const action =
      typeof body.action === "string" && allowedActions.includes(body.action as ListingAction)
        ? (body.action as ListingAction)
        : "save";

    // office-mode nadal zapisujemy kto kliknął (audyt). Tryb dajemy do payload.
    const payload = {
      mode,
      note: note ?? null,
      ua: optString(req.headers["user-agent"]) ?? null,
    };

    const sql = `
      INSERT INTO external_listing_actions (
        office_id,
        external_listing_id,
        user_id,
        action,
        payload
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::jsonb)
      RETURNING id
    `;

    const { rows } = await pool.query<{ id: string }>(sql, [
      officeId,
      externalListingId,
      userId,
      action,
      JSON.stringify(payload),
    ]);

    return res.status(200).json({ ok: true, id: rows?.[0]?.id ?? null });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_SAVE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}