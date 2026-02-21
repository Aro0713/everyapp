// pages/api/external_listings/map.ts
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

function parseBbox(bboxRaw: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  // bbox = "minLng,minLat,maxLng,maxLat"
  const parts = bboxRaw.split(",").map((s) => s.trim());
  if (parts.length !== 4) return null;

  const minLng = Number(parts[0]);
  const minLat = Number(parts[1]);
  const maxLng = Number(parts[2]);
  const maxLat = Number(parts[3]);

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;

  // sanity
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;

  return { minLng, minLat, maxLng, maxLat };
}

type MapPointRow = {
  id: string;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
  thumb_url: string | null;
  matched_at: string | null;
  lat: number;
  lng: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const bboxRaw = optString(req.query.bbox);
    if (!bboxRaw) return res.status(400).json({ error: "MISSING_BBOX" });

    const bbox = parseBbox(bboxRaw);
    if (!bbox) return res.status(400).json({ error: "INVALID_BBOX" });

    const limitRaw = optNumber(req.query.limit) ?? 1500;
    const limit = Math.min(Math.max(limitRaw, 1), 3000);

    const source = optString(req.query.source); // "otodom"|"olx"|...
    const matchedSince = optString(req.query.matchedSince); // timestamptz ISO

    const includePreview = optString(req.query.includePreview) === "1";
    const includeInactive = optString(req.query.includeInactive) === "1";

    // status/source_status gating – jak u Ciebie w list
    // MVP: pokaż preview jeśli includePreview=1, inaczej ukryj preview
    // source_status: domyślnie pomijamy "removed" jeśli includeInactive != 1
    const where: string[] = [];
    const params: any[] = [];
    let p = 1;

    where.push(`office_id = $${p++}::uuid`);
    params.push(officeId);

    where.push(`lat IS NOT NULL AND lng IS NOT NULL`);
    where.push(`lng >= $${p++} AND lng <= $${p++}`);
    params.push(bbox.minLng, bbox.maxLng);

    where.push(`lat >= $${p++} AND lat <= $${p++}`);
    params.push(bbox.minLat, bbox.maxLat);

    if (source && source !== "all") {
      where.push(`source = $${p++}`);
      params.push(source);
    }

    if (matchedSince) {
      where.push(`matched_at >= $${p++}::timestamptz`);
      params.push(matchedSince);
    }

    if (!includePreview) {
      where.push(`status <> 'preview'`);
    }

    if (!includeInactive) {
      where.push(`COALESCE(source_status, 'active') <> 'removed'`);
    }

    const sql = `
      SELECT
        id,
        source,
        source_url,
        title,
        price_amount,
        currency,
        thumb_url,
        matched_at,
        lat,
        lng
      FROM external_listings
      WHERE ${where.join(" AND ")}
      ORDER BY matched_at DESC NULLS LAST, updated_at DESC, id DESC
      LIMIT $${p++}
    `;
    params.push(limit);

    const { rows } = await pool.query<MapPointRow>(sql, params);

    return res.status(200).json({
      ok: true,
      officeId,
      bbox,
      count: rows.length,
      points: rows,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_MAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}