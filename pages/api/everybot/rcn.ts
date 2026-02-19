// pages/api/everybot/rcn.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type Row = {
  id: string;
  office_id: string;
  lat: number;
  lng: number;
};

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const WFS_BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn";
const LAYERS = ["ms:lokale", "ms:budynki", "ms:dzialki"] as const;

// heurystyka pól: Geoportal potrafi mieć różne nazwy atrybutów w properties
const PRICE_KEYS = [
  "cena", "cena_brutto", "cena_transakcyjna", "cenaTransakcyjna", "wartosc", "wartość", "price",
];
const DATE_KEYS = [
  "data", "data_transakcji", "dataTransakcji", "data_zawarcia", "dataAktu", "transaction_date", "date",
];

function pickKeyCaseInsensitive(obj: Record<string, any>, keys: string[]): string | null {
  const lowerMap = new Map<string, string>();
  for (const k of Object.keys(obj)) lowerMap.set(k.toLowerCase(), k);
  for (const want of keys) {
    const hit = lowerMap.get(want.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function parseDateLoose(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string" && v.trim()) {
    // ISO / yyyy-mm-dd / yyyy-mm-ddThh...
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function bboxFromPoint(lat: number, lng: number, meters: number) {
  // przybliżenie: 1 deg lat ~ 111_320 m
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const minx = lng - dLng;
  const miny = lat - dLat;
  const maxx = lng + dLng;
  const maxy = lat + dLat;
  return { minx, miny, maxx, maxy };
}

async function wfsGetFeatureGeoJson(
  typeName: string,
  bbox: { minx: number; miny: number; maxx: number; maxy: number }
) {
  // Geoportal jest kapryśny na format CRS w BBOX.
  // Najstabilniej: SRSNAME=EPSG:4326 i BBOX z EPSG:4326 (bez URN).
  const u = new URL(WFS_BASE);

  // ✅ UPPERCASE param names (większa kompatybilność z serwerami WMS/WFS)
  u.searchParams.set("SERVICE", "WFS");
  u.searchParams.set("REQUEST", "GetFeature");
  u.searchParams.set("VERSION", "2.0.0");
  u.searchParams.set("TYPENAMES", typeName);

  // ✅ jawny CRS
  u.searchParams.set("SRSNAME", "EPSG:4326");

  // ✅ BBOX: minx,miny,maxx,maxy,EPSG:4326 (bez urn:ogc:def:crs...)
  u.searchParams.set("BBOX", `${bbox.minx},${bbox.miny},${bbox.maxx},${bbox.maxy},EPSG:4326`);

  u.searchParams.set("COUNT", "50");

  const url = u.toString();

  const r = await fetch(url, {
    headers: {
      accept: "text/xml, application/xml;q=0.9, */*;q=0.8",
      "user-agent": "EveryAPP/EveryBOT RCN client",
    },
  });

  const txt = await r.text().catch(() => "");

  // ❗️Zamiast throw na 400, zwracamy null (żeby pętla mogła zapisać chociaż link i rcn_enriched_at)
  if (!r.ok) {
    // log tylko pierwsze 200 znaków (żeby nie zalać logów)
    console.log("RCN_WFS_FAIL", { status: r.status, typeName, url: url.slice(0, 300), body: txt.slice(0, 200) });
    return null;
  }

  // GeoJSON
  try {
    return JSON.parse(txt);
  } catch {
    // serwer może zwrócić XML mimo OUTPUTFORMAT
    console.log("RCN_WFS_NON_JSON", { typeName, body: txt.slice(0, 200) });
    return txt;
  }
}

function buildGeoportalLink(lat: number, lng: number) {
  // najpewniejszy link: otwórz mapę w okolicy punktu (center)
  const u = new URL("https://mapy.geoportal.gov.pl/imapnext/imap/");
  u.searchParams.set("map", "mapa");
  u.searchParams.set("center", `${lng},${lat}`);
  u.searchParams.set("scale", "5000");
  return u.toString();
}

function extractBestTransactionFromXml(xml: string) {
  if (!xml || typeof xml !== "string") return null;

  // szybki test: czy są jakiekolwiek featureMember/featureMembers
  const hasFeatures =
    xml.includes("featureMember") ||
    xml.includes("featureMembers") ||
    xml.includes(":lokale") ||
    xml.includes(":dzialki") ||
    xml.includes(":budynki");

  if (!hasFeatures) return null;

  // mega-MVP: wyciągnij pierwszą liczbę, która wygląda jak cena (>= 1000)
  const priceMatch = xml.match(/>(\d{4,})<\/(cena|cena_brutto|cena_transakcyjna|wartosc|wartość|price)>/i);
  const price = priceMatch ? Number(priceMatch[1]) : null;

  // mega-MVP: wyciągnij pierwszą datę ISO yyyy-mm-dd
  const dateMatch = xml.match(/>(\d{4}-\d{2}-\d{2})</);
  const dateISO = dateMatch ? dateMatch[1] : null;

  return {
    price: Number.isFinite(price as any) ? price : null,
    dateISO,
    detected: { priceKey: priceMatch?.[2] ?? null, dateKey: dateISO ? "date" : null },
  };
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

    const radiusMeters = optNumber((req.body ?? {}).radiusMeters) ?? 250;

    const { rows } = await pool.query<Row>(
      `
      SELECT id, office_id, lat, lng
      FROM external_listings
      WHERE office_id = $1
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND (
          rcn_enriched_at IS NULL
          OR rcn_enriched_at < now() - interval '30 days'
        )
      ORDER BY rcn_enriched_at NULLS FIRST, updated_at DESC
      LIMIT $2
      `,
      [officeId, limit]
    );

    let processed = 0;
    const errors: Array<{ id: string; error: string }> = [];
    const debug: Array<any> = [];

    for (const r0 of rows) {
      try {
        const bbox = bboxFromPoint(r0.lat, r0.lng, radiusMeters);

        let best: { price: number | null; dateISO: string | null; detected: any } | null = null;

        for (const layer of LAYERS) {
        const xml = await wfsGetFeatureGeoJson(layer, bbox);
        if (!xml) continue;
        const pick = extractBestTransactionFromXml(String(xml));
          if (pick && (pick.price != null || pick.dateISO != null)) {
            best = pick;
            break;
          }
        }

        const link = buildGeoportalLink(r0.lat, r0.lng);

        await pool.query(
          `
          UPDATE external_listings
          SET
            rcn_last_price = $1,
            rcn_last_date = $2,
            rcn_link = $3,
            rcn_enriched_at = now(),
            updated_at = now()
          WHERE office_id = $4 AND id = $5
          `,
          [best?.price ?? null, best?.dateISO ?? null, link, officeId, r0.id]
        );

        processed += 1;

        // debug: tylko do odpowiedzi, nie do DB
        debug.push({ id: r0.id, ...best?.detected });

        await sleep(250);
      } catch (e: any) {
        errors.push({ id: r0.id, error: e?.message ?? "rcn failed" });
      }
    }

    return res.status(200).json({
      ok: true,
      officeId,
      requested: limit,
      processed,
      radiusMeters,
      errors,
      debug,
    });
  } catch (e: any) {
    console.error("EVERYBOT_RCN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
