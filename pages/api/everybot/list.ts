import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // ✅ POST zamiast GET → brak ETag/304 na Vercel dla list endpointu
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const body = req.body ?? {};
    const q = optString(body.q);
    const source = optString(body.source);
    const status = optString(body.status);
    const matchedSince = optString(body.matchedSince);
    const limitRaw = optNumber(body.limit) ?? 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM office_external_listings_overview
      WHERE office_id = $1
        AND ($2::text IS NULL OR source = $2)
        AND ($3::text IS NULL OR status = $3)
        AND ($4::timestamptz IS NULL OR matched_at >= $4::timestamptz)
        AND (
          $5::text IS NULL
          OR title ILIKE '%' || $5 || '%'
          OR location_text ILIKE '%' || $5 || '%'
          OR source_url ILIKE '%' || $5 || '%'
        )
      ORDER BY matched_at DESC NULLS LAST, imported_at DESC
      LIMIT $6
      `,
      [officeId, source, status, matchedSince, q, limit]
    );


    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }
    console.error("EVERYBOT_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
