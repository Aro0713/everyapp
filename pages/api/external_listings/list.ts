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
  status: string;
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
    
     console.log("external_listings/list query:", req.query);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
    const officeId = await getOfficeIdForUserId(userId);

    const limitRaw = optNumber(req.query.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    // ✅ nowa paginacja stronami (page=1..N). Jeśli page jest podane -> używamy OFFSET.
    const pageRaw = optNumber(req.query.page);
    const page = pageRaw != null ? Math.min(Math.max(pageRaw, 1), 1000000) : null;

    // ✅ cursor (seek pagination): updated_at + id (fallback, gdy nie ma page)
    const cursorUpdatedAt = optString(req.query.cursorUpdatedAt);
    const cursorId = optString(req.query.cursorId);

    const q = optString(req.query.q)?.toLowerCase() ?? null;
    const source = optString(req.query.source); // "otodom"|"olx"|...
    const status = optString(req.query.status) ?? "active";
    const includeInactive = optString(req.query.includeInactive) === "1";
    const onlyEnriched = optString(req.query.onlyEnriched) === "1";
    const includePreview = optString(req.query.includePreview) !== "0"; // domyślnie TAK

    const where: string[] = [`1=1`];

    if (!includePreview) {
      where.push(`status <> 'preview'`);
    }

    const params: any[] = [];
    let p = 1;

    const matchedSince = optString(req.query.matchedSince);
    if (matchedSince) {
      // ✅ nie wycinaj rekordów z NULL matched_at (stare cache)
      where.push(`(
        matched_at >= $${p}::timestamptz
        OR matched_at IS NULL
      )`);
      params.push(matchedSince);
      p++;
    }

    const hasMatchedSince = !!matchedSince;

    const orderBy = hasMatchedSince
      ? `matched_at DESC NULLS LAST, updated_at DESC, id DESC`
      : `updated_at DESC, id DESC`;

    if (source && source !== "all") {
      where.push(`source = $${p++}`);
      params.push(source);
    }

    // ✅ SAFETY: OLX ma być tylko nieruchomości (real-estate category)
    where.push(`(
      source <> 'olx'
      OR (source_url LIKE '%/nieruchomosci/%' AND source_url LIKE '%/d/oferta/%')
    )`);

    if (!includeInactive && status) {
      where.push(`COALESCE(source_status, 'active') = $${p++}`);
      params.push(status);
    }

    if (onlyEnriched) {
      where.push(`status = 'enriched'`);
    }

      // --- NEW FILTERS FROM SEARCH PANEL ---
    // Zasada MVP: preview często ma braki danych => NIE WYCIINAMY preview filtrami strukturalnymi.
    // Każdy filtr: (status='preview' OR <warunek>)

    const transactionType = optString(req.query.transactionType);
    const propertyType = optString(req.query.propertyType);
    const locationText = optString(req.query.locationText);
    const city = optString(req.query.city);
    const district = optString(req.query.district);
    const voivodeship = optString(req.query.voivodeship);
    const street = optString(req.query.street);
    const minPrice = optNumber(req.query.minPrice);
    const maxPrice = optNumber(req.query.maxPrice);
    const minArea = optNumber(req.query.minArea);
    const maxArea = optNumber(req.query.maxArea);
    const rooms = optNumber(req.query.rooms);

    // Q działa TYLKO jeśli nie ma filtrów strukturalnych
    const hasDetailFilters =
      !!transactionType ||
      !!propertyType ||
      !!locationText ||
      !!city ||
      !!district ||
      !!voivodeship ||
      !!street ||
      minPrice != null ||
      maxPrice != null ||
      minArea != null ||
      maxArea != null ||
      rooms != null;

    const hasStructuredFilters = hasDetailFilters;

  // q działa tylko gdy nie ma structured filters (jak masz)
if (q && !hasStructuredFilters) {
  const terms = q
    .split(/[,\s]+/g)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);

  if (terms.length) {
    const ors: string[] = [];
    for (const term of terms) {
      ors.push(`(
        LOWER(COALESCE(title,'')) LIKE $${p}
        OR LOWER(COALESCE(location_text,'')) LIKE $${p}
      )`);
      params.push(`%${term}%`);
      p++;
    }
    where.push(`(${ors.join(" OR ")})`);
  }
}

// 1) TRANSACTION TYPE (STRICT: tylko transaction_type)
if (transactionType) {
  const v = transactionType.toLowerCase().trim();
  where.push(`(
    transaction_type IS NULL
    OR transaction_type = ''
    OR LOWER(transaction_type) = $${p}
  )`);
  params.push(v);
  p++;
}

// 2) PROPERTY TYPE (STRICT: tylko property_type)
if (propertyType) {
  const v = propertyType.toLowerCase().trim();
  where.push(`(
    property_type IS NULL
    OR property_type = ''
    OR LOWER(property_type) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 3) LOCATION TEXT (STRICT: tylko location_text)
if (locationText) {
  const v = locationText.toLowerCase().trim();
  where.push(`(
    location_text IS NULL
    OR location_text = ''
    OR LOWER(location_text) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 4) CITY (STRICT: tylko city)
if (city) {
  const v = city.toLowerCase().trim();
  where.push(`(
    city IS NULL
    OR city = ''
    OR LOWER(city) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 5) DISTRICT (STRICT: tylko district)
if (district) {
  const v = district.toLowerCase().trim();
  where.push(`(
    district IS NULL
    OR district = ''
    OR LOWER(district) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 6) STREET (STRICT: tylko street)
if (street) {
  const v = street.toLowerCase().trim();
  where.push(`(
    street IS NULL
    OR street = ''
    OR LOWER(street) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 7) VOIVODESHIP (STRICT: tylko voivodeship)
if (voivodeship) {
  const v = voivodeship.toLowerCase().trim();
  where.push(`(
    voivodeship IS NULL
    OR voivodeship = ''
    OR LOWER(voivodeship) LIKE $${p}
  )`);
  params.push(`%${v}%`);
  p++;
}

// 8) NUMERIC FILTERS (NULL-pass-through, szybkie)
if (minPrice != null) {
  where.push(`(
    price_amount IS NULL
    OR price_amount >= $${p}
  )`);
  params.push(minPrice);
  p++;
}

if (maxPrice != null) {
  where.push(`(
    price_amount IS NULL
    OR price_amount <= $${p}
  )`);
  params.push(maxPrice);
  p++;
}

if (minArea != null) {
  where.push(`(
    area_m2 IS NULL
    OR area_m2 >= $${p}
  )`);
  params.push(minArea);
  p++;
}

if (maxArea != null) {
  where.push(`(
    area_m2 IS NULL
    OR area_m2 <= $${p}
  )`);
  params.push(maxArea);
  p++;
}

if (rooms != null) {
  where.push(`(
    rooms IS NULL
    OR rooms = $${p}
  )`);
  params.push(rooms);
  p++;
}

    // ====== TRYB 1: page-based (LIMIT/OFFSET) ======
    if (page != null) {
      // total count pod numerki stron
      const countSql = `
        SELECT count(*)::bigint AS cnt
        FROM external_listings
        WHERE ${where.join(" AND ")}
      `;
      const countRes = await pool.query<{ cnt: string }>(countSql, params);
      const total = Number(countRes.rows?.[0]?.cnt ?? "0");
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      const offset = (page - 1) * limit;

      const sql = `
        SELECT
          id, office_id, source, source_url, status,
          title, description,
          price_amount, currency, location_text,
          thumb_url, matched_at,
          transaction_type, property_type,
          area_m2, price_per_m2, rooms,
          floor, year_built,
          voivodeship, city, district, street,
          owner_phone,
          source_status, last_seen_at, last_checked_at, enriched_at,
          updated_at
        FROM external_listings
        WHERE ${where.join(" AND ")}
        ORDER BY ${orderBy}
        LIMIT $${p} OFFSET $${p + 1}
      `;

      const listParams = [...params, limit, offset];
      const { rows } = await pool.query<Row>(sql, listParams);

      return res.status(200).json({
        rows,
        page,
        limit,
        total,
        totalPages,
      });
    }

    // ====== TRYB 2: cursor-based (dotychczasowy) ======
    if (cursorUpdatedAt && cursorId) {
      where.push(`(
        updated_at < $${p}::timestamptz
        OR (updated_at = $${p}::timestamptz AND id < $${p + 1}::uuid)
      )`);
      params.push(cursorUpdatedAt, cursorId);
      p += 2;
    }

     const sql = `
      SELECT
        id, office_id, source, source_url, status,
        title, description,
        price_amount, currency, location_text,
        thumb_url, matched_at,
        transaction_type, property_type,
        area_m2, price_per_m2, rooms,
        floor, year_built,
        voivodeship, city, district, street,
        owner_phone,
        source_status, last_seen_at, last_checked_at, enriched_at,
        updated_at
      FROM external_listings
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${p++}
    `;

    params.push(limit);

    const { rows } = await pool.query<Row>(sql, params);
    console.log("external_listings/list returned:", { count: rows.length });

    const last = rows.length ? rows[rows.length - 1] : null;
    const nextCursor =
      rows.length === limit && last ? { updated_at: last.updated_at, id: last.id } : null;

    return res.status(200).json({ rows, nextCursor });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

