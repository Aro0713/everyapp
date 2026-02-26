// pages/api/offers/list.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

type ListingRow = {
  listing_id: string;
  office_id: string;
  record_type: string;
  transaction_type: string;
  status: string;
  created_at: string;
  case_owner_name: string | null;
  parties_summary: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 🔒 tylko GET
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 🔒 twarde wyłączenie cache (Vercel + przeglądarka)
    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const limitRaw = optNumber(req.query.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw ?? 50, 1), 200);

    const { rows } = await pool.query<ListingRow>(
      `
      SELECT
        listing_id::text,
        office_id::text,
        record_type::text,
        transaction_type::text,
        status::text,
        created_at,
        case_owner_name,
        parties_summary
      FROM office_listings_overview
      WHERE office_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2::int
      `,
      [officeId, limit]
    );

    // 🔒 serializacja daty (żeby frontend nie dostał Date object)
    const safeRows: ListingRow[] = rows.map((r) => ({
      ...r,
      created_at:
        typeof r.created_at === "string"
          ? r.created_at
          : new Date(r.created_at as any).toISOString(),
    }));

    // ✅ DEBUG META (tymczasowo) – zobaczysz czy filtr trafia w office_id
    return res.status(200).json({
      rows: safeRows,
      meta: {
        officeId,
        limit,
        count: safeRows.length,
      },
    });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}