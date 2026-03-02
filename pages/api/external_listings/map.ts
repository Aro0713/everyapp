import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function normalizeVoivodeshipInput(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return (
    s
      .replace(/^wojew[oó]dztwo\s+/i, "")
      .replace(/^woj\.?\s+/i, "")
      .trim() || null
  );
}
function norm(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}
function mapPropertyFilterToCanonical(s: string) {
  const v = (s ?? "").toLowerCase();
  if (!v) return "";
  if (v.includes("dom") || v.includes("house")) return "house";
  if (v.includes("miesz") || v.includes("apart") || v.includes("flat") || v.includes("apartment"))
    return "apartment";
  if (v.includes("dzial") || v.includes("dział") || v.includes("plot") || v.includes("grunt")) return "plot";
  if (v.includes("lokal") || v.includes("biur") || v.includes("commercial")) return "commercial";
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ✅ ważne: bez cache, żeby nie było 304 na mapie
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const limitRaw = optNumber(req.query.limit) ?? 2000;
    const limit = Math.min(Math.max(limitRaw, 1), 5000);

    // bbox (z mapy)
    const minLat = optNumber(req.query.minLat);
    const maxLat = optNumber(req.query.maxLat);
    const minLng = optNumber(req.query.minLng);
    const maxLng = optNumber(req.query.maxLng);

    const hasBbox =
      minLat != null &&
      maxLat != null &&
      minLng != null &&
      maxLng != null &&
      minLat < maxLat &&
      minLng < maxLng;

    // filtry UI (z OffersView.loadMapPins)
    const transactionTypeRaw = optString(req.query.transactionType);
    const transactionType = transactionTypeRaw
      ? transactionTypeRaw.toLowerCase().trim() === "kupno"
        ? "sale"
        : transactionTypeRaw.toLowerCase().trim() === "wynajem"
          ? "rent"
          : transactionTypeRaw.toLowerCase().trim()
      : null;

    const voivodeship = normalizeVoivodeshipInput(optString(req.query.voivodeship));
    const city = optString(req.query.city);
    const district = optString(req.query.district);

    // optional (jeśli kiedyś dołożysz do mapPins)
    const propertyTypeRaw = optString(req.query.propertyType);
    const propertyType = propertyTypeRaw ? mapPropertyFilterToCanonical(propertyTypeRaw) : null;

    // ✅ budujemy WHERE i paramy bez ruszania list.ts
    const where: string[] = [];
    const params: any[] = [officeId, limit];
    let p = 3;

    // bbox
    if (hasBbox) {
      where.push(`el.lat BETWEEN $${p++}::double precision AND $${p++}::double precision`);
      where.push(`el.lng BETWEEN $${p++}::double precision AND $${p++}::double precision`);
      params.push(minLat, maxLat, minLng, maxLng);
    }

    // transactionType
    if (transactionType) {
      where.push(`LOWER(COALESCE(el.transaction_type,'')) = $${p++}::text`);
      params.push(transactionType);
    }

    // propertyType (kanoniczne)
    if (propertyType) {
      where.push(`LOWER(COALESCE(el.property_type,'')) = $${p++}::text`);
      params.push(propertyType);
    }

    // voivodeship / city / district: miękko (LIKE po uproszczonej normalizacji w JS)
    // (bez unaccent w SQL, żeby nie ryzykować zależności / wydajności)
    if (voivodeship) {
      where.push(`LOWER(COALESCE(el.voivodeship,'')) LIKE $${p++}::text`);
      params.push(`%${norm(voivodeship)}%`);
    }
    if (city) {
      where.push(`(
        LOWER(COALESCE(el.city,'')) LIKE $${p}::text
        OR LOWER(COALESCE(el.location_text,'')) LIKE $${p}::text
      )`);
      params.push(`%${norm(city)}%`);
      p++;
    }
    if (district) {
      where.push(`(
        LOWER(COALESCE(el.district,'')) LIKE $${p}::text
        OR LOWER(COALESCE(el.location_text,'')) LIKE $${p}::text
      )`);
      params.push(`%${norm(district)}%`);
      p++;
    }

    const whereSql = where.length ? `AND ${where.join(" AND ")}` : ``;

    const { rows } = await pool.query(
      `
      SELECT
        el.id,
        el.source,
        el.source_url,
        el.title,
        el.price_amount,
        el.currency,
        el.updated_at,

        -- ✅ klucz: wymuś numbery (PG numeric -> JS string)
        el.lat::double precision AS lat,
        el.lng::double precision AS lng,

        el.city,
        el.district,
        el.street,

        COALESCE(last_action.payload->>'mode', NULL) AS saved_mode
      FROM external_listings el
      LEFT JOIN LATERAL (
        SELECT payload
        FROM external_listing_actions
        WHERE office_id = el.office_id
          AND external_listing_id = el.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) last_action ON true
      WHERE el.office_id = $1::uuid
        AND el.lat IS NOT NULL AND el.lng IS NOT NULL
        ${whereSql}
      ORDER BY el.updated_at DESC, el.id DESC
      LIMIT $2::int
      `,
      params
    );

    return res.status(200).json({
      ok: true,
      officeId,
      pins: rows,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_MAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}