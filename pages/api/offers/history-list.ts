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
    mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(mustUserId(req));
    const listingId = optString(req.query.id);

    if (!listingId) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const rows = await client.query(
      `
      SELECT
        h.id,
        h.event_type,
        h.event_label,
        h.old_value,
        h.new_value,
        h.note,
        h.created_by_user_id,
        h.created_at,
        u.full_name AS created_by_name
      FROM public.listing_history h
      LEFT JOIN public.users u
        ON u.id = h.created_by_user_id
      WHERE h.listing_id = $1
        AND h.office_id = $2
      ORDER BY h.created_at DESC
      `,
      [listingId, officeId]
    );

    return res.status(200).json({ ok: true, rows: rows.rows });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_HISTORY_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}