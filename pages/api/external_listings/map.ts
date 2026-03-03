// pages/api/external_listings/map.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function bucketKey(n: number, decimals: number) {
  return n.toFixed(decimals);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

    const limitRaw = optNumber(req.query.limit) ?? 5000;
    const limit = Math.min(Math.max(limitRaw, 1), 5000);

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
        el.lat::double precision AS lat,
        el.lng::double precision AS lng,
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
        AND el.lat IS NOT NULL
        AND el.lng IS NOT NULL
      ORDER BY el.updated_at DESC, el.id DESC
      LIMIT $2::int
      `,
      [officeId, limit]
    );

    // DEBUG (backend) — stable signal for Vercel logs
    if (rows.length) {
      const sample = rows.slice(0, 300);

      const lats = sample.map((r: any) => Number(r.lat)).filter(Number.isFinite);
      const lngs = sample.map((r: any) => Number(r.lng)).filter(Number.isFinite);

      const latMin = lats.length ? Math.min(...lats) : null;
      const latMax = lats.length ? Math.max(...lats) : null;
      const lngMin = lngs.length ? Math.min(...lngs) : null;
      const lngMax = lngs.length ? Math.max(...lngs) : null;

      // invalid WGS84
      let badRows = 0;

      // suspicious swapped (heuristic): lat looks like 14..24 and lng looks like 49..55 (typical PL swap)
      let suspectSwapped = 0;

      // buckets to catch "vertical line" effect (many same lng)
      const lngBuckets = new Map<string, number>();
      const latBuckets = new Map<string, number>();

      for (const r of sample as any[]) {
        const lat = Number(r.lat);
        const lng = Number(r.lng);

        if (!isValidLatLng(lat, lng)) badRows++;

        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= 13 &&
          lat <= 25 &&
          lng >= 48 &&
          lng <= 56
        ) {
          suspectSwapped++;
        }

        if (Number.isFinite(lng)) {
          const k = bucketKey(lng, 3); // ~110m bucket
          lngBuckets.set(k, (lngBuckets.get(k) ?? 0) + 1);
        }
        if (Number.isFinite(lat)) {
          const k = bucketKey(lat, 3);
          latBuckets.set(k, (latBuckets.get(k) ?? 0) + 1);
        }
      }

      const topN = (m: Map<string, number>, n = 5) =>
        Array.from(m.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)
          .map(([k, v]) => ({ k, v }));

      // crude payload size estimate
      let payloadBytes = 0;
      try {
        payloadBytes = Buffer.byteLength(JSON.stringify(rows), "utf8");
      } catch {}

      console.info("[EveryBOT][MAP_API_RANGE]", {
        ts: nowIso(),
        reqId,
        officeId,
        count: rows.length,
        sampleN: sample.length,
        latMin,
        latMax,
        lngMin,
        lngMax,
        lngSpan: lngMin !== null && lngMax !== null ? lngMax - lngMin : null,
        latSpan: latMin !== null && latMax !== null ? latMax - latMin : null,
        badRows,
        suspectSwapped,
        topLngBuckets: topN(lngBuckets, 5),
        topLatBuckets: topN(latBuckets, 5),
        payloadBytes,
      });
    } else {
      console.info("[EveryBOT][MAP_API_RANGE]", {
        ts: nowIso(),
        reqId,
        officeId,
        count: 0,
        sampleN: 0,
      });
    }

    return res.status(200).json({
      ok: true,
      officeId,
      pins: rows,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_MAP_ERROR", { reqId, msg: e?.message, e });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}