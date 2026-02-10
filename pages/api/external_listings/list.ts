// pages/api/external_listings/list.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type Row = {
  id: string;
  office_id: string;
  source: string;
  source_url: string;
  title: string | null;
  description: string | null;
  price_amount: number | null;
  currency: string | null;
  location_text: string | null;

  thumb_url: string | null;
  matched_at: string | null;

  transaction_type: string | null;
  property_type: string | null;

  area_m2: number | null;
  price_per_m2: number | null;
  rooms: number | null;

  floor: string | null;
  year_built: number | null;

  voivodeship: string | null;
  city: string | null;
  district: string | null;
  street: string | null;

  owner_phone: string | null;

  source_status: string | null;
  last_seen_at: string | null;
  last_checked_at: string | null;
  enriched_at: string | null;

  created_at: string;
  updated_at: string;
};

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
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
    const officeId = await getOfficeIdForUserId(userId);

    const limitRaw = optNumber(req.query.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    // cursor = updated_at ISO or created_at ISO (prosty cursor po czasie)
    const cursor = optString(req.query.cursor);

    const q = optString(req.query.q)?.toLowerCase() ?? null;
    const source = optString(req.query.source); // "otodom"|"olx"|...
    const status = optString(req.query.status) ?? "active"; // domyślnie active
    const includeInactive = optString(req.query.includeInactive) === "1";

    const where: string[] = [`office_id = $1`];
    const params: any[] = [officeId];
    let p = 2;

    if (source && source !== "all") {
      where.push(`source = $${p++}`);
      params.push(source);
    }

    if (!includeInactive) {
      where.push(`COALESCE(source_status, 'unknown') = $${p++}`);
      params.push(status);
    }

    if (q) {
      where.push(`(
        LOWER(COALESCE(title,'')) LIKE $${p}
        OR LOWER(COALESCE(location_text,'')) LIKE $${p}
        OR LOWER(COALESCE(city,'')) LIKE $${p}
        OR LOWER(COALESCE(district,'')) LIKE $${p}
        OR LOWER(COALESCE(street,'')) LIKE $${p}
      )`);
      params.push(`%${q}%`);
      p++;
    }

    if (cursor) {
      // cursor po updated_at, desc
      where.push(`updated_at < $${p++}`);
      params.push(cursor);
    }

    const sql = `
      SELECT
        id, office_id, source, source_url,
        title, description,
        price_amount, currency, location_text,
        thumb_url, matched_at,
        transaction_type, property_type,
        area_m2, price_per_m2, rooms,
        floor, year_built,
        voivodeship, city, district, street,
        owner_phone,
        source_status, last_seen_at, last_checked_at, enriched_at,
        created_at, updated_at
      FROM external_listings
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT $${p++}
    `;

    params.push(limit);

    const { rows } = await pool.query<Row>(sql, params);

    const nextCursor = rows.length === limit ? rows[rows.length - 1].updated_at : null;

    return res.status(200).json({ rows, nextCursor });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
