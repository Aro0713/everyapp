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
  district: string | null;
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
  // ✅ Zawsze próbujemy z pól strukturalnych (najlepsza skuteczność)
  const street = (r.street ?? "").trim();
  const district = (r.district ?? "").trim();
  const city = (r.city ?? "").trim();
  const voiv = (r.voivodeship ?? "").trim();

  // 1) street + city (+ voiv) + Poland
  const q1 = joinParts([street || null, district || null, city || null, voiv || null, "Poland"]);
  if (street && city && q1) return q1;

  // 2) district + city (+ voiv) + Poland
  const q2 = joinParts([district || null, city || null, voiv || null, "Poland"]);
  if (city && q2) return q2;

  // 3) city + voiv + Poland
  const q3 = joinParts([city || null, voiv || null, "Poland"]);
  if (city && q3) return q3;

  // 4) ostatni fallback: oczyszczony location_text + (voiv/city) + Poland
  const ltRaw = (r.location_text ?? "").trim();
  const lt = ltRaw ? cleanLooseLocationText(ltRaw) : "";
  const q4 = joinParts([lt || null, city || null, voiv || null, "Poland"]);
  if (lt && q4) return q4;

  return null;
}
function cleanLooseLocationText(s: string): string {
  // OLX często: "Warszawa - Dzisiaj 12:30", "Warszawa · dzisiaj", "Warszawa, 2 dni temu"
  let out = (s ?? "").trim();

  // usuń część po "·" (często data)
  out = out.split("·")[0]?.trim() ?? out;

  // usuń część po " - " jeśli wygląda na datę/czas/relatywne
  out = out.replace(/\s+-\s+(dzisiaj|wczoraj|jutro|[0-9]{1,2}\s+\w+|[0-9]{1,2}:[0-9]{2}|[0-9]+\s+dni?\s+temu).*/i, "").trim();

  // usuń końcówki typu "2 dni temu", "dzisiaj", "wczoraj"
  out = out.replace(/\b(dzisiaj|wczoraj|jutro|przedwczoraj)\b/gi, "").trim();
  out = out.replace(/\b\d+\s*(dni|dzień|godz|godzin|min|minut)\s*temu\b/gi, "").trim();

  // usuń podwójne separatory
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function joinParts(parts: Array<string | null | undefined>): string | null {
  const xs = parts
    .map((x) => (x ?? "").trim())
    .filter(Boolean);

  if (!xs.length) return null;
  return xs.join(", ");
}
function sanitizeGeocodeQuery(q: string): string {
  const s0 = (q ?? "").trim();
  if (!s0) return "";

  // usuń relatywne daty/czas
  let s = s0
    .replace(/\b(dzisiaj|wczoraj|jutro|przedwczoraj)\b/gi, " ")
    .replace(/\b\d+\s*(dni|dzień|godz|godzin|min|minut)\s*temu\b/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ");

  // usuń kontrolne/dziwne znaki
  s = s
    .replace(/[^\p{L}\p{N}\s,.\-\/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Photon: krócej = lepiej
  return s.slice(0, 120);
}

async function geocodePhoton(q: string): Promise<{ lat: number; lng: number; confidence: number } | null> {
  const qq = sanitizeGeocodeQuery(q);

  // twarda bramka – nie wysyłamy śmieci
  if (!qq || qq.length < 3) return null;

  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", qq);
  u.searchParams.set("lang", "pl");
  u.searchParams.set("limit", "1");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);

  const r = await fetch(u.toString(), {
    signal: ctrl.signal,
    headers: {
      accept: "application/json",
      "user-agent": "EveryAPP/EveryBOT geocoder (contact: admin@everyapp.pl)",
    },
  }).finally(() => clearTimeout(t));

  const bodyText = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(`PHOTON_HTTP_${r.status} ${bodyText.slice(0, 200)}`);
  }

  const j = bodyText ? JSON.parse(bodyText) : null;
  const f = j?.features?.[0];
  const coords = f?.geometry?.coordinates; // [lon,lat]
  const lon = optNumber(coords?.[0]);
  const lat = optNumber(coords?.[1]);
  if (lat == null || lon == null) return null;

  // ✅ Heurystyczna confidence na podstawie tego, co Photon zwrócił
  const p = f?.properties ?? {};
  const hasHouse = typeof p.housenumber === "string" && p.housenumber.trim();
  const hasStreet = typeof p.street === "string" && p.street.trim();
  const hasCity = typeof p.city === "string" && p.city.trim();
  const hasState = typeof p.state === "string" && p.state.trim();

  let conf = 0.15;
  if (hasState) conf += 0.05;
  if (hasCity) conf += 0.10;
  if (hasStreet) conf += 0.20;
  if (hasHouse) conf += 0.40;

  // cap
  if (conf > 0.95) conf = 0.95;

  // ✅ próg jakości – poniżej traktujemy jak fail (żeby nie kłaść pinezek w centroidzie)
  if (conf < 0.20) return null;

  return { lat, lng: lon, confidence: conf };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const isCron = req.headers["x-cron-internal"] === "1";

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ✅ CRON auth (bez sesji)
    if (isCron) {
      const cronSecret = req.headers["x-cron-secret"];
      if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "UNAUTHORIZED_CRON" });
      }
    }

    // ✅ officeId zależnie od trybu
    let officeId: string | null = null;

    if (!isCron) {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

      officeId = await getOfficeIdForUserId(userId);
      if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    } else {
      // MVP: wybierz biuro z największą liczbą rekordów (żeby nie brać losowego)
      const r = await pool.query<{ office_id: string }>(
        `
        SELECT office_id
        FROM external_listings
        WHERE (lat IS NULL OR lng IS NULL)
        AND (city IS NOT NULL OR location_text IS NOT NULL)
        AND (
            geocoded_at IS NULL
            OR (geocode_confidence = 0 AND geocoded_at < now() - interval '7 days')
        )
        GROUP BY office_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
        `
      );
      officeId = r.rows?.[0]?.office_id ?? null;
      if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const limitRaw = optNumber((req.body ?? {}).limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const { rows } = await pool.query<Row>(
      `
      SELECT id, office_id, location_text, street, city, district, voivodeship
      FROM external_listings
      WHERE office_id = $1
        AND (lat IS NULL OR lng IS NULL)
        AND (
            geocoded_at IS NULL
            OR (geocode_confidence = 0 AND geocoded_at < now() - interval '7 days')
            )
        AND (city IS NOT NULL OR (location_text IS NOT NULL AND btrim(location_text) <> ''))
        ORDER BY
        (street IS NOT NULL AND btrim(street) <> '') DESC,
        (city IS NOT NULL AND btrim(city) <> '') DESC,
        enriched_at DESC NULLS LAST,
        updated_at DESC,
        id DESC
      LIMIT $2
      `,
      [officeId, limit]
    );

    let processed = 0;
    const errors: Array<{ id: string; q: string; error: string }> = [];

    for (const r0 of rows) {
      const q = buildQuery(r0);
      if (!q) continue;

      let geo: { lat: number; lng: number; confidence: number } | null = null;

      try {
        geo = await geocodePhoton(q);
      } catch (e: any) {
        const msg = e?.message ?? "geocode failed";
        errors.push({ id: r0.id, q, error: msg });

        // ✅ log tylko pierwszy raz, żeby nie zalać Vercel
        if (errors.length === 1) {
          console.log("PHOTON_FAIL_SAMPLE", { id: r0.id, q, msg });
        }

        await sleep(250);
        continue;
      }

      if (!geo) {
      await pool.query(
        `UPDATE external_listings
        SET geocoded_at = now(),
            SET geocode_source = 'photon_low_conf',
            geocode_confidence = 0,
            updated_at = now()
        WHERE office_id = $1 AND id = $2`,
        [officeId, r0.id]
        );
        processed += 1;
        await sleep(250);
        continue;
      }

      await pool.query(
        `UPDATE external_listings
         SET lat = $1,
             lng = $2,
             geocoded_at = now(),
             geocode_source = 'photon',
             geocode_confidence = $3,
             updated_at = now()
         WHERE office_id = $4 AND id = $5`,
        [geo.lat, geo.lng, geo.confidence, officeId, r0.id]
      );

      processed += 1;
      await sleep(250);
    }

    return res.status(200).json({
      ok: true,
      officeId,
      requested: limit,
      processed,
      errorsCount: errors.length,
      errors: errors.slice(0, 5),
    });
  } catch (e: any) {
    console.error("EVERYBOT_GEOCODE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
