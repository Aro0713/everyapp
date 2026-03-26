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
    const eventType = optString(req.body?.eventType) ?? "manual_update";
    const eventLabel = optString(req.body?.eventLabel) ?? "Ręczna zmiana";
    const oldValue = optString(req.body?.oldValue);
    const newValue = optString(req.body?.newValue);
    const note = optString(req.body?.note);

    if (!listingId) {
      return res.status(400).json({ error: "MISSING_LISTING_ID" });
    }

    const exists = await client.query(
      `
      SELECT id
      FROM public.listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    if (!exists.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const inserted = await client.query(
      `
      INSERT INTO public.listing_history (
        office_id,
        listing_id,
        event_type,
        event_label,
        old_value,
        new_value,
        note,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [officeId, listingId, eventType, eventLabel, oldValue, newValue, note, userId]
    );

    return res.status(200).json({ ok: true, row: inserted.rows[0] });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_HISTORY_ADD_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}