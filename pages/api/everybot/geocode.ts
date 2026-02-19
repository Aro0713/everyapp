// pages/api/everybot/geocode.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type Row = {
  id: string;
  office_id: string;
  location_text: string | null;
  street: string | null;
  city: string | null;
  voivodeship: string | null;
};

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQuery(r: Row): string | null {
  const parts = [
    r.street,
    r.city,
    r.voivodeship,
  ].map((x) => (x ?? "").trim()).filter(Boolean);

  // najlepszy przypadek: ulica + miasto
  if (parts.length >= 2) return parts.join(", ");

  // fallback: location_text + city
  const lt = (r.location_text ?? "").trim();
  const c = (r.city ?? "").trim();
  if (lt && c) return `${lt}, ${c}`;
  if (lt) return lt;
  if (c) return c;

  return null;
}

/**
 * Photon (komercyjnie: hostuj sam; MVP: publiczny endpoint działa, ale nie spamuj)
 * Public: https://photon.komoot.io/api/?q=...&lang=pl&limit=1
 * Alternatywa: Nominatim (jeszcze ostrzejszy rate-limit)
 */
async function geocodePhoton(q: string): Promise<{ lat: number; lng: number; confidence: number } | null> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("lang", "pl");
  u.searchParams.set("limit", "1");

  const r = await fetch(u.toString(), {
    headers: {
      "accept": "application/json",
      "user-agent": "EveryAPP/EveryBOT geocoder (contact: admin@everyapp.pl)",
    },
  });

  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = j?.features?.[0];
  const coords = f?.geometry?.coordinates; // [lon,lat]
  const lon = optNumber(coords?.[0]);
  const lat = optNumber(coords?.[1]);
  if (lat == null || lon == null) return null;

  // photon daje "properties.osm_value"/"type" itp., ale confidence wyliczamy prosto
  const conf = 0.6; // MVP: stała; potem możesz podbić gdy match jest "house"/"street"
  return { lat, lng: lon, confidence: conf };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const limitRaw = optNumber((req.body ?? {}).limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const { rows } = await pool.query<Row>(
      `
      SELECT id, office_id, location_text, street, city, voivodeship
      FROM external_listings
      WHERE office_id = $1
        AND (lat IS NULL OR lng IS NULL)
        AND geocoded_at IS NULL
        AND (city IS NOT NULL OR location_text IS NOT NULL)
      ORDER BY enriched_at DESC NULLS LAST, updated_at DESC
      LIMIT $2
      `,
      [officeId, limit]
    );

    let processed = 0;
    const errors: Array<{ id: string; q: string; error: string }> = [];

    for (const r0 of rows) {
      const q = buildQuery(r0);
      if (!q) continue;

      try {
        const geo = await geocodePhoton(q);
        if (!geo) {
          await pool.query(
            `UPDATE external_listings
             SET geocoded_at = now(), geocode_source = 'photon', geocode_confidence = 0
             WHERE office_id = $1 AND id = $2`,
            [officeId, r0.id]
          );
          processed += 1;
          await sleep(250);
          continue;
        }

        await pool.query(
          `
          UPDATE external_listings
          SET lat = $1,
              lng = $2,
              geocoded_at = now(),
              geocode_source = 'photon',
              geocode_confidence = $3,
              updated_at = now()
          WHERE office_id = $4 AND id = $5
          `,
          [geo.lat, geo.lng, geo.confidence, officeId, r0.id]
        );

        processed += 1;

        // rate-limit (MVP)
        await sleep(250);
      } catch (e: any) {
        errors.push({ id: r0.id, q, error: e?.message ?? "geocode failed" });
      }
    }

    return res.status(200).json({ ok: true, officeId, requested: limit, processed, errors });
  } catch (e: any) {
    console.error("EVERYBOT_GEOCODE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
