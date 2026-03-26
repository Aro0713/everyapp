import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);

    const listingId = optString(req.body?.listingId);
    const type = optString(req.body?.type);
    const note = optString(req.body?.note);

    if (!listingId || !type) {
      return res.status(400).json({ error: "MISSING_DATA" });
    }

    await client.query(
      `
      INSERT INTO public.listing_history (
        office_id,
        listing_id,
        event_type,
        event_label,
        note,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        officeId,
        listingId,
        type,
        type,
        note,
        userId,
      ]
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("EVENT_ADD_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "error" });
  } finally {
    client.release();
  }
}