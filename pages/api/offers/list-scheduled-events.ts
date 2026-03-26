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

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const listingId = optString(req.query.id);

    if (!listingId) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const listing = await client.query(
      `
      SELECT id
      FROM public.listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    if (!listing.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const rows = await client.query(
      `
      SELECT
        e.id,
        e.org_id,
        e.calendar_id,
        e.listing_id,
        e.client_id,
        e.title,
        e.description,
        e.location_text,
        e.start_at,
        e.end_at,
        e.status,
        e.created_by,
        e.updated_by,
        e.created_at,
        e.updated_at,
        e.type,
        e.source,
        e.outcome,
        e.meta,
        c.name AS calendar_name,
        u.full_name AS created_by_name
      FROM public.events e
      LEFT JOIN public.calendars c
        ON c.id = e.calendar_id
      LEFT JOIN public.users u
        ON u.id = e.created_by
      WHERE e.listing_id = $1
      ORDER BY e.start_at DESC
      `,
      [listingId]
    );

    return res.status(200).json({ ok: true, rows: rows.rows });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_LIST_SCHEDULED_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}