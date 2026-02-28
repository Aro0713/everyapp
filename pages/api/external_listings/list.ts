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
  lat: number | null;
  lng: number | null;
  rcn_last_price: number | null;
  rcn_last_date: string | null;
  rcn_link: string | null;

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

  handled_by_office_id?: string | null;
  handled_since?: string | null;
  last_interaction_at?: string | null;
  last_action?: string | null;
  my_office_saved?: boolean | null;
};

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function isUuid(s: string | null): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
function optTimestamptz(v: unknown): string | null {
  const s = optString(v);
  if (!s) return null;

  if (s === "0" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;

  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;

  if (ms < 946684800000) return null; // 2000-01-01

  return new Date(ms).toISOString();
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
function normLike(v: string) {
  return `%${norm(v)}%`;
}

// fallback gdy w row.city/district jest null: sprawdzaj w location_text
function isMatchCity(row: any, city: string) {
  const fv = norm(city);
  if (!fv) return true;

  const inLoc = norm(row.location_text).includes(fv);
  const rv = norm(row.city);

  return (rv ? rv === fv : false) || inLoc;
}

function isMatchDistrict(row: any, district: string) {
  const fv = norm(district);
  if (!fv) return true;

  const inLoc = norm(row.location_text).includes(fv);
  const rv = norm(row.district);

  return (rv ? rv === fv : false) || inLoc;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const raw = v.trim();
    if (!raw) return null;

    const n = Number(raw.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function mapPropertyFilterToCanonical(s: string) {
  const v = (s ?? "").toLowerCase();
  if (!v) return "";
  if (v.includes("dom") || v.includes("house")) return "house";
  if (v.includes("miesz") || v.includes("apart") || v.includes("flat") || v.includes("apartment")) return "apartment";
  if (v.includes("dzial") || v.includes("dział") || v.includes("plot") || v.includes("grunt")) return "plot";
  if (v.includes("lokal") || v.includes("biur") || v.includes("commercial")) return "commercial";
  return v;
}

function scoreRow(row: any, f: any): { band: "green" | "yellow" | "none"; restScore: number } {
  const fVoiv = norm(f.voivodeship);
  if (fVoiv && norm(row.voivodeship) !== fVoiv) return { band: "none", restScore: 0 };

  const fCity = norm(f.city);
  if (fCity && !isMatchCity(row, f.city)) return { band: "none", restScore: 0 };

  const fDistrict = norm(f.district);
  if (fDistrict && !isMatchDistrict(row, f.district)) return { band: "none", restScore: 0 };

  let active = 0;
  let matched = 0;

  const add = (isActive: boolean, ok: boolean) => {
    if (!isActive) return;
    active += 1;
    if (ok) matched += 1;
  };

  const ft = norm(f.transactionType);
  add(!!ft, norm(row.transaction_type) === ft);

  const fpt = mapPropertyFilterToCanonical(String(f.propertyType ?? ""));
  add(
    !!fpt,
    mapPropertyFilterToCanonical(row.property_type) === fpt ||
      (fpt === "house" && norm(row.title).includes("dom")) ||
      (fpt === "apartment" && norm(row.title).includes("mieszkan")) ||
      (fpt === "plot" && (norm(row.title).includes("dzialk") || norm(row.title).includes("grunt"))) ||
      (fpt === "commercial" && (norm(row.title).includes("lokal") || norm(row.title).includes("biur")))
  );

  const minA = num(f.minArea);
  const maxA = num(f.maxArea);
  const area = num(row.area_m2);
  add(minA != null, area != null && area >= (minA as number));
  add(maxA != null, area != null && area <= (maxA as number));

  const minP = num(f.minPrice);
  const maxP = num(f.maxPrice);
  const price = num(row.price_amount);
  add(minP != null, price != null && price >= (minP as number));
  add(maxP != null, price != null && price <= (maxP as number));

  const fr = num(f.rooms);
  const rooms = num(row.rooms);
  add(fr != null, rooms != null && rooms === (fr as number));

  const restScore = active === 0 ? 1 : matched / active;

  if (restScore >= 0.9) return { band: "green", restScore };
  if (restScore >= 0.5) return { band: "yellow", restScore };
  return { band: "none", restScore };
}

function hasAnyFiltersForScoring(f: {
  voivodeship?: string;
  city?: string;
  district?: string;
  transactionType?: string;
  propertyType?: string;
  minPrice?: any;
  maxPrice?: any;
  minArea?: any;
  maxArea?: any;
  rooms?: any;
}) {
  return !!(
    (f.voivodeship ?? "").trim() ||
    (f.city ?? "").trim() ||
    (f.district ?? "").trim() ||
    (f.transactionType ?? "").trim() ||
    (f.propertyType ?? "").trim() ||
    num(f.minPrice) != null ||
    num(f.maxPrice) != null ||
    num(f.minArea) != null ||
    num(f.maxArea) != null ||
    num(f.rooms) != null
  );
}

type RelaxedFlags = { city?: boolean; district?: boolean };

function buildWhereWithoutSoft(baseWhere: string[], opts: { dropCity?: boolean; dropDistrict?: boolean }) {
  const out: string[] = [];

  for (const w of baseWhere) {
    const s = String(w);

    if (opts.dropCity && s.includes("COALESCE(city,''))") && s.includes("COALESCE(location_text,''))")) {
      continue;
    }
    if (opts.dropDistrict && s.includes("COALESCE(district,''))") && s.includes("COALESCE(location_text,''))")) {
      continue;
    }
    out.push(w);
  }

  return out;
}

function scoreFiltersWithRelax(scoreFilters: any, relaxed: RelaxedFlags) {
  const next = { ...scoreFilters };
  if (relaxed.city) next.city = "";
  if (relaxed.district) next.district = "";
  return next;
}

function buildListSql(whereSql: string, orderBy: string, pLimit: number, pOffset?: number) {
  return `
    WITH action_agg AS (
      SELECT
        external_listing_id,
        (ARRAY_AGG(office_id ORDER BY created_at DESC))[1] AS handled_by_office_id,
        MAX(created_at) AS last_interaction_at,
        (ARRAY_AGG(action ORDER BY created_at DESC))[1] AS last_action,
        MIN(created_at) FILTER (WHERE action = 'save') AS handled_since
      FROM external_listing_actions
      GROUP BY external_listing_id
    ),
    my_saved AS (
      SELECT
        external_listing_id,
        TRUE AS my_office_saved
      FROM external_listing_actions
      WHERE office_id = $1::uuid AND action = 'save'
      GROUP BY external_listing_id
    )
    SELECT
      l.id, l.office_id, l.source, l.source_url, l.status,
      l.title, l.description,
      l.price_amount, l.currency, l.location_text,
      l.thumb_url, l.matched_at,
      l.transaction_type, l.property_type,
      l.area_m2, l.price_per_m2, l.rooms,
      l.floor, l.year_built,
      l.voivodeship, l.city, l.district, l.street,
      l.owner_phone,
      l.source_status, l.last_seen_at, l.last_checked_at, l.enriched_at,

      l.lat, l.lng,
      l.rcn_last_price, l.rcn_last_date, l.rcn_link,

      l.updated_at,

      a.handled_by_office_id,
      a.handled_since,
      a.last_interaction_at,
      a.last_action,
      COALESCE(ms.my_office_saved, FALSE) AS my_office_saved
    FROM external_listings l
    LEFT JOIN action_agg a ON a.external_listing_id = l.id
    LEFT JOIN my_saved ms ON ms.external_listing_id = l.id
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${pLimit}::int
    ${typeof pOffset === "number" ? `OFFSET $${pOffset}::int` : ``}
  `;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const limitRaw = optNumber(req.query.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const pageRaw = optNumber(req.query.page);
    const page = pageRaw != null ? Math.min(Math.max(pageRaw, 1), 1000000) : null;

    const cursorUpdatedAt = optTimestamptz(req.query.cursorUpdatedAt);
    const cursorId = optString(req.query.cursorId);

    const q = optString(req.query.q)?.toLowerCase() ?? null;
    const source = optString(req.query.source);
    const includeInactive = optString(req.query.includeInactive) === "1";
    const onlyEnriched = optString(req.query.onlyEnriched) === "1";
    const includePreview = optString(req.query.includePreview) !== "0";
    const strict = optString(req.query.strict) === "1";
    const matchedSince = optTimestamptz(req.query.matchedSince);
    const mode = optString(req.query.mode) ?? null;
    const filtersHash = optString(req.query.filtersHash) ?? null;

    const where: string[] = [`1=1`];

    const params: any[] = [officeId];
    let p = 2;

    where.push(`$1::uuid IS NOT NULL`);

    if (matchedSince) {
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

    const transactionType = optString(req.query.transactionType);
    const propertyType = optString(req.query.propertyType);
    const locationText = optString(req.query.locationText);
    const city = optString(req.query.city);
    const district = optString(req.query.district);
    const voivodeship = normalizeVoivodeshipInput(optString(req.query.voivodeship));
    const street = optString(req.query.street);
    const minPrice = optNumber(req.query.minPrice);
    const maxPrice = optNumber(req.query.maxPrice);
    const minArea = optNumber(req.query.minArea);
    const maxArea = optNumber(req.query.maxArea);
    const rooms = optNumber(req.query.rooms);

    const scoreFilters = {
      voivodeship: voivodeship ?? "",
      city: city ?? "",
      district: district ?? "",
      transactionType: transactionType ?? "",
      propertyType: propertyType ?? "",
      minPrice,
      maxPrice,
      minArea,
      maxArea,
      rooms,
    };

    const useScoring = hasAnyFiltersForScoring(scoreFilters);

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

    if (mode === "search") {
      const hasAny = !!q || hasStructuredFilters || useScoring;
      if (!hasAny) {
        return res.status(200).json({
          rows: [],
          nextCursor: null,
          meta: {
            officeId,
            limit,
            includeInactive,
            includePreview,
            onlyEnriched,
            mode,
            filtersHash,
            reason: "EMPTY_SEARCH_GUARD",
          },
        });
      }
    }
      if (q && !hasStructuredFilters) {
        const terms = q
          .split(/[,\s]+/g)
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length >= 2);

        if (terms.length) {
          const ors: string[] = [];
          for (const term of terms) {
            ors.push(`(
              LOWER(COALESCE(title,'')) LIKE $${p}::text
              OR LOWER(COALESCE(location_text,'')) LIKE $${p}::text
            )`);
            params.push(`%${term}%`);
            p++;
          }
          where.push(`(${ors.join(" OR ")})`);
        }
      }

      if (transactionType) {
        const v = transactionType.toLowerCase().trim();
        const mapped = v === "kupno" ? "sale" : v === "wynajem" ? "rent" : v;

        where.push(`(LOWER(COALESCE(transaction_type,'')) = $${p}::text)`);
        params.push(mapped);
        p++;
      }

      if (propertyType) {
        const vCanon = mapPropertyFilterToCanonical(propertyType);
        const raw = String(propertyType).trim().toLowerCase();

        where.push(`(
          LOWER(COALESCE(property_type,'')) = $${p}::text
          OR LOWER(COALESCE(property_type,'')) LIKE $${p + 1}::text
          OR LOWER(COALESCE(title,'')) LIKE $${p + 1}::text
          OR LOWER(COALESCE(title,'')) LIKE '%dom%'
        )`);

        params.push(vCanon);
        params.push(`%${raw}%`);
        p += 2;
      }

      if (locationText && !(city || district)) {
        const v = locationText.toLowerCase().trim();
        where.push(`(LOWER(COALESCE(location_text,'')) LIKE $${p}::text)`);
        params.push(`%${v}%`);
        p++;
      }

      // ✅ unaccent tylko na kolumnach, parametr znormalizowany w JS
      if (street) {
        where.push(
          strict
            ? `(position($${p}::text in unaccent(LOWER(COALESCE(street,'')))::text) > 0)`
            : `(
                street IS NULL
                OR street = ''
                OR position($${p}::text in unaccent(LOWER(street))::text) > 0
              )`
        );
        params.push(norm(street));
        p++;
      }

      if (voivodeship) {
        where.push(`(position($${p}::text in unaccent(LOWER(COALESCE(voivodeship,'')))::text) > 0)`);
        params.push(norm(voivodeship));
        p++;
      }

      if (city) {
        where.push(`(
          position($${p}::text in unaccent(LOWER(COALESCE(city,'')))::text) > 0
          OR position($${p}::text in unaccent(LOWER(COALESCE(district,'')))::text) > 0
          OR position($${p}::text in unaccent(LOWER(COALESCE(location_text,'')))::text) > 0
        )`);
        params.push(norm(city));
        p++;
      }

      if (district) {
        where.push(`(
          position($${p}::text in unaccent(LOWER(COALESCE(district,'')))::text) > 0
          OR position($${p}::text in unaccent(LOWER(COALESCE(location_text,'')))::text) > 0
        )`);
        params.push(norm(district));
        p++;
      }

          if (minPrice != null) {
      where.push(
        strict
          ? `(price_amount >= $${p}::double precision)`
          : `(price_amount IS NULL OR price_amount >= $${p}::double precision)`
      );
      params.push(minPrice);
      p++;
    }

    if (maxPrice != null) {
      where.push(
        strict
          ? `(price_amount <= $${p}::double precision)`
          : `(price_amount IS NULL OR price_amount <= $${p}::double precision)`
      );
      params.push(maxPrice);
      p++;
    }

    if (minArea != null) {
      where.push(
        strict
          ? `(area_m2 >= $${p}::double precision)`
          : `(area_m2 IS NULL OR area_m2 >= $${p}::double precision)`
      );
      params.push(minArea);
      p++;
    }

    if (maxArea != null) {
      where.push(
        strict
          ? `(area_m2 <= $${p}::double precision)`
          : `(area_m2 IS NULL OR area_m2 <= $${p}::double precision)`
      );
      params.push(maxArea);
      p++;
    }

    if (rooms != null) {
      where.push(strict ? `(rooms = $${p}::int)` : `(rooms IS NULL OR rooms = $${p}::int)`);
      params.push(rooms);
      p++;
    }

    console.log("EXTERNAL_LISTINGS_LIST_DEBUG", {
      where: where.join(" AND "),
      params,
      p,
      useScoring,
      filters: {
        q,
        source,
        transactionType,
        propertyType,
        voivodeship,
        city,
        district,
        street,
        minPrice,
        maxPrice,
        minArea,
        maxArea,
        rooms,
        matchedSince,
      },
    });
    console.log("EXTERNAL_LISTINGS_LIST_BUILD_ID", {
      buildTs: "2026-02-27T17:xx:xxZ",
      file: "pages/api/external_listings/list.ts",
    });
    
    // ====== TRYB 1: page-based ======
    if (page != null) {
      const countSql = `
        SELECT count(*)::bigint AS cnt
        FROM external_listings
        WHERE ${where.join(" AND ")}
      `;
      const countRes = await pool.query<{ cnt: string }>(countSql, params);
      const total = Number(countRes.rows?.[0]?.cnt ?? "0");
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      const overfetch = Math.min(limit * 10, 2000);
      const offset = (page - 1) * limit;

      const sql = buildListSql(where.join(" AND "), orderBy, p, p + 1);
      const listParams = [...params, overfetch, offset];

      let relaxed: RelaxedFlags = {};
      let { rows } = await pool.query<Row>(sql, listParams);

      if (rows.length === 0 && !strict && (city || district)) {
        if (city) {
          const where2 = buildWhereWithoutSoft(where, { dropCity: true, dropDistrict: false });
          const sql2 = buildListSql(where2.join(" AND "), orderBy, p, p + 1);
          const { rows: r2 } = await pool.query<Row>(sql2, listParams);
          if (r2.length) {
            rows = r2;
            relaxed.city = true;
          }
        }

        if (rows.length === 0 && district) {
          const where3 = buildWhereWithoutSoft(where, { dropCity: true, dropDistrict: true });
          const sql3 = buildListSql(where3.join(" AND "), orderBy, p, p + 1);
          const { rows: r3 } = await pool.query<Row>(sql3, listParams);
          if (r3.length) {
            rows = r3;
            relaxed.city = !!city;
            relaxed.district = true;
          }
        }
      }

      if (!useScoring) {
        return res.status(200).json({
          rows: rows.slice(0, limit),
          page,
          limit,
          total,
          totalPages,
          meta: { mode, filtersHash, relaxed },
        });
      }

      const scored = rows
        .map((r: any) => {
          const s = scoreRow(r, scoreFiltersWithRelax(scoreFilters, relaxed));
          return { ...r, match_band: s.band, match_score: s.restScore };
        })
        .filter((r: any) => r.match_band !== "none")
        .sort((a: any, b: any) => {
          const w = (x: string) => (x === "green" ? 2 : x === "yellow" ? 1 : 0);
          const dw = w(b.match_band) - w(a.match_band);
          if (dw !== 0) return dw;
          return (b.match_score ?? 0) - (a.match_score ?? 0);
        })
        .slice(0, limit);

      return res.status(200).json({
        rows: scored,
        page,
        limit,
        total,
        totalPages,
        meta: { mode, filtersHash, relaxed },
      });
    }

    // ====== TRYB 2: cursor-based ======
    if (cursorUpdatedAt && isUuid(cursorId)) {
      where.push(`(
        updated_at < $${p}::timestamptz
        OR (updated_at = $${p}::timestamptz AND id < $${p + 1}::uuid)
      )`);
      params.push(cursorUpdatedAt, cursorId);
      p += 2;
    }

    const overfetch = Math.min(limit * 10, 2000);
    params.push(overfetch);

    const sql = buildListSql(where.join(" AND "), orderBy, p);
    let relaxed: RelaxedFlags = {};
    let { rows } = await pool.query<Row>(sql, params);

    if (rows.length === 0 && !strict && (city || district)) {
      if (city) {
        const where2 = buildWhereWithoutSoft(where, { dropCity: true, dropDistrict: false });
        const sql2 = buildListSql(where2.join(" AND "), orderBy, p);
        const { rows: r2 } = await pool.query<Row>(sql2, params);
        if (r2.length) {
          rows = r2;
          relaxed.city = true;
        }
      }

      if (rows.length === 0 && district) {
        const where3 = buildWhereWithoutSoft(where, { dropCity: true, dropDistrict: true });
        const sql3 = buildListSql(where3.join(" AND "), orderBy, p);
        const { rows: r3 } = await pool.query<Row>(sql3, params);
        if (r3.length) {
          rows = r3;
          relaxed.city = !!city;
          relaxed.district = true;
        }
      }
    }

    if (!useScoring) {
      const pageRows = rows.slice(0, limit);
      const lastRaw = pageRows.length ? pageRows[pageRows.length - 1] : null;

      const nextCursor =
        rows.length === overfetch && lastRaw ? { updated_at: lastRaw.updated_at, id: lastRaw.id } : null;

      return res.status(200).json({
        rows: pageRows,
        nextCursor,
        meta: {
          officeId,
          limit,
          includeInactive,
          includePreview,
          onlyEnriched,
          mode,
          filtersHash,
          relaxed,
        },
      });
    }

    const scored = rows
      .map((r: any) => {
        const s = scoreRow(r, scoreFiltersWithRelax(scoreFilters, relaxed));
        return { ...r, match_band: s.band, match_score: s.restScore };
      })
      .filter((r: any) => r.match_band !== "none")
      .sort((a: any, b: any) => {
        const w = (x: string) => (x === "green" ? 2 : x === "yellow" ? 1 : 0);
        const dw = w(b.match_band) - w(a.match_band);
        if (dw !== 0) return dw;
        return (b.match_score ?? 0) - (a.match_score ?? 0);
      })
      .slice(0, limit);

    const lastRaw = rows.length ? rows[rows.length - 1] : null;
    const nextCursor = rows.length === overfetch && lastRaw ? { updated_at: lastRaw.updated_at, id: lastRaw.id } : null;

    return res.status(200).json({
      rows: scored,
      nextCursor,
      meta: {
        officeId,
        limit,
        includeInactive,
        includePreview,
        onlyEnriched,
        mode,
        filtersHash,
        relaxed,
      },
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}