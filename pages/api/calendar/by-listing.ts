import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type ListingCalendarRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  location_text: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  outcome: string | null;
  source: string | null;
  client_id: string | null;
};

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Invalid ${name}`);
  }
  return v.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const listingId = mustString(req.query.listingId, "listingId");
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

    const officeRes = await pool.query(
      `
      SELECT office_id
      FROM memberships
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY (role = 'owner') DESC, created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const officeId: string | null = officeRes.rows[0]?.office_id ?? null;
    if (!officeId) {
      return res.status(404).json({ error: "No active office membership for user" });
    }

    const listingRes = await pool.query(
      `
      SELECT id
      FROM listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    if (!listingRes.rows[0]) {
      return res.status(404).json({ error: "Listing not found in office" });
    }

    const { rows } = await pool.query<ListingCalendarRow>(
      `
      SELECT
        e.id,
        e.title,
        e.start_at,
        e.end_at,
        e.location_text,
        e.description,
        e.type,
        e.status,
        e.outcome,
        e.source,
        e.client_id
      FROM events e
      WHERE e.org_id = $1
        AND e.listing_id = $2
      ORDER BY e.start_at DESC
      LIMIT $3
      `,
      [officeId, listingId, limit]
    );

    return res.status(200).json({
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        startAt: r.start_at,
        endAt: r.end_at,
        locationText: r.location_text,
        description: r.description,
        eventType: r.type,
        status: r.status,
        outcome: r.outcome,
        source: r.source,
        clientId: r.client_id,
      })),
    });
  } catch (e: any) {
    console.error("CAL_BY_LISTING_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}