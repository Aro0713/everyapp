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
const LAYERS = ["lokale", "budynki", "dzialki"] as const;

const PRICE_KEYS = [
  // ✅ RCN WFS (lokale/dzialki/budynki)
  "tran_cena_brutto",
  "nier_cena_brutto",
  "lok_cena_brutto",
  "dzi_cena_brutto",
  "bud_cena_brutto",

  // fallback
  "cena",
  "cena_brutto",
  "cena_transakcyjna",
  "cenaTransakcyjna",
  "wartosc",
  "wartość",
  "price",
];

const DATE_KEYS = [
  // ✅ RCN WFS
  "dok_data",

  // fallback
  "data",
  "data_transakcji",
  "dataTransakcji",
  "data_zawarcia",
  "dataAktu",
  "transaction_date",
  "date",
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
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function bboxFromPoint(lat: number, lng: number, meters: number) {
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
  const u = new URL(WFS_BASE);

  u.searchParams.set("SERVICE", "WFS");
  u.searchParams.set("REQUEST", "GetFeature");
  u.searchParams.set("VERSION", "1.1.0");
  u.searchParams.set("TYPENAMES", typeName);

  // ✅ CRS84 (lon,lat)
  u.searchParams.set("SRSNAME", "EPSG:4326");
    u.searchParams.set(
    "BBOX",
    `${bbox.minx},${bbox.miny},${bbox.maxx},${bbox.maxy},EPSG:4326`
    );

  // ✅ spróbuj JSON
  u.searchParams.set("OUTPUTFORMAT", "application/json");
  u.searchParams.set("COUNT", "50");

  const url = u.toString();

  const r = await fetch(url, {
    headers: {
      accept: "application/json, text/xml;q=0.9, application/xml;q=0.8, */*;q=0.7",
      "user-agent": "EveryAPP/EveryBOT RCN client",
    },
  });

  const txt = await r.text().catch(() => "");
  const contentType = r.headers.get("content-type") ?? "";
  console.log("RCN_WFS_RESP", { typeName, status: r.status, contentType });

  if (!r.ok) {
    console.log("RCN_WFS_FAIL", {
      status: r.status,
      typeName,
      url: url.slice(0, 300),
      body: txt.slice(0, 200),
    });
    return null;
  }

  // JSON first
  try {
    const json = JSON.parse(txt);
    const n = Array.isArray(json?.features) ? json.features.length : null;
    if (n != null) console.log("RCN_WFS_FEATURES", { typeName, features: n });
    return json;
  } catch {
    // XML fallback
    const numReturned =
      txt.match(/numberReturned="(\d+)"/i)?.[1] ??
      txt.match(/numberReturned='(\d+)'/i)?.[1] ??
      null;

    if (numReturned !== null) {
      console.log("RCN_WFS_COUNT", { typeName, numberReturned: Number(numReturned) });
    }

    return txt;
  }
}

function buildGeoportalLink(lat: number, lng: number) {
  const u = new URL("https://mapy.geoportal.gov.pl/imapnext/imap/");
  u.searchParams.set("map", "mapa");
  u.searchParams.set("center", `${lng},${lat}`);
  u.searchParams.set("scale", "5000");
  return u.toString();
}

function extractBestTransactionFromXml(xml: string, typeName: string) {
  if (!xml || typeof xml !== "string") return null;

  // szybka normalizacja whitespace, żeby regexy działały stabilnie
  const s = xml.replace(/\s+/g, " ");

  // 1) ✅ wykryj OWS ExceptionReport nawet jeśli HTTP=200
  if (/<\s*ows:ExceptionReport\b/i.test(s) || /<\s*ExceptionReport\b/i.test(s)) {
    // log tylko mały fragment, żeby nie zalać
    console.log("RCN_WFS_EXCEPTION_XML", { typeName, sample: s.slice(0, 220) });
    return null;
  }

  // helper: czytaj <prefix:tag>VALUE</prefix:tag> oraz <tag>VALUE</tag>
  const findTag = (tag: string): string | null => {
    const re = new RegExp(
      `<(?:(\\w+):)?${tag}\\b[^>]*>([^<]+)</(?:(\\w+):)?${tag}>`,
      "i"
    );
    const m = s.match(re);
    return m?.[2]?.trim() ?? null;
  };

  // helper: czytaj <prefix:tag .../> lub <tag .../> (np. nil/empty) -> zwraca null
  const isNilTag = (tag: string): boolean => {
    const re = new RegExp(`<(?:(\\w+):)?${tag}\\b[^>]*xsi:nil\\s*=\\s*["']true["'][^>]*/?>`, "i");
    return re.test(s);
  };

  // 2) ✅ cena: zamiast “na sztywno”, przeleć po PRICE_KEYS
  let price: number | null = null;
  for (const k of PRICE_KEYS) {
    if (isNilTag(k)) continue;

    const v = findTag(k);
    if (!v) continue;

    const n = Number(
      v
        .replace(/\u00A0/g, " ")     // NBSP
        .replace(/\s/g, "")         // spacje tysięcy
        .replace(",", ".")          // przecinek dziesiętny
        .replace(/[^\d.]/g, "")     // tylko cyfry i kropka
    );

    if (Number.isFinite(n) && n > 0) {
      price = n;
      break;
    }
  }

  // 3) ✅ data: przeleć po DATE_KEYS
  let dateISO: string | null = null;
  for (const k of DATE_KEYS) {
    if (isNilTag(k)) continue;

    const v = findTag(k);
    if (!v) continue;

    // ISO yyyy-mm-dd
    const iso = v.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (iso) {
      dateISO = iso;
      break;
    }

    // dd.mm.yyyy
    const dm = v.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
    if (dm) {
      dateISO = `${dm[3]}-${dm[2]}-${dm[1]}`;
      break;
    }

    // fallback: Date()
    const d = parseDateLoose(v);
    if (d) {
      dateISO = d.toISOString().slice(0, 10);
      break;
    }
  }

  if (price == null && dateISO == null) {
    // debug 1-liner: czy w ogóle mamy jakiekolwiek “cena” w XML?
    // (bez dumpowania całości)
    const hasAnyPriceLike =
      /cena/i.test(s) || /price/i.test(s) || /warto/i.test(s);
    if (hasAnyPriceLike) {
      console.log("RCN_XML_NO_PICK", { typeName, hint: "has_price_like_words", sample: s.slice(0, 220) });
    }
    return null;
  }

  return {
    price,
    dateISO,
    sourceId: null as string | null,
    detected: { typeName, mode: "xml" },
  };
}

function extractBestTransactionFromPayload(payload: any, typeName: string) {
  if (!payload) return null;

  // JSON/GeoJSON
  if (typeof payload === "object") {
    const features = Array.isArray(payload.features) ? payload.features : [];

    for (const f of features) {
      const props = f?.properties ?? {};

      let price: number | null = null;
      for (const k of PRICE_KEYS) {
        const hit = pickKeyCaseInsensitive(props, [k]);
        if (hit) {
          const n = optNumber(props[hit]);
          if (n != null) {
            price = n;
            break;
          }
        }
      }

      let dateISO: string | null = null;
      for (const k of DATE_KEYS) {
        const hit = pickKeyCaseInsensitive(props, [k]);
        if (hit) {
          const d = parseDateLoose(props[hit]);
          if (d) {
            dateISO = d.toISOString().slice(0, 10);
            break;
          }
        }
      }

      const sourceId = typeof f?.id === "string" && f.id.trim() ? f.id.trim() : null;

      if (price != null || dateISO != null) {
        return { price, dateISO, sourceId, detected: { typeName, mode: "json" } };
      }
    }

    return null;
  }

  // XML string
  return extractBestTransactionFromXml(String(payload), typeName);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const isCron = req.headers["x-cron-internal"] === "1";

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (isCron) {
      const cronSecret = req.headers["x-cron-secret"];
      if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "UNAUTHORIZED_CRON" });
      }
    }

    const limitRaw = optNumber((req.body ?? {}).limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const radiusMeters = optNumber((req.body ?? {}).radiusMeters) ?? 250;
    const retryHours = optNumber((req.body ?? {}).retryHours) ?? 6;
    const force = String((req.body ?? {}).force ?? "") === "1";

    let officeId: string | null = null;

    if (!isCron) {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

      officeId = await getOfficeIdForUserId(userId);
      if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    } else {
      const r = await pool.query<{ office_id: string }>(
        `
        SELECT office_id
        FROM external_listings
        WHERE lat IS NOT NULL AND lng IS NOT NULL
          AND (
            $1::boolean = true
            OR rcn_enriched_at IS NULL
            OR rcn_enriched_at < now() - ($2::text || ' hours')::interval
          )
        GROUP BY office_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
        `,
        [force, String(retryHours)]
      );

      officeId = r.rows?.[0]?.office_id ?? null;
      if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const { rows } = await pool.query<Row>(
      `
      SELECT id, office_id, lat, lng
      FROM external_listings
      WHERE office_id = $1
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND (
          $3::boolean = true
          OR rcn_enriched_at IS NULL
          OR rcn_enriched_at < now() - ($4::text || ' hours')::interval
        )
      ORDER BY rcn_enriched_at NULLS FIRST, updated_at DESC, id DESC
      LIMIT $2
      `,
      [officeId, limit, force, String(retryHours)]
    );

    let processed = 0;
    const errors: Array<{ id: string; error: string }> = [];
    const debug: Array<any> = [];

    for (const r0 of rows) {
      try {
        const bbox = bboxFromPoint(r0.lat, r0.lng, radiusMeters);

        let best:
          | { price: number | null; dateISO: string | null; sourceId: string | null; detected: any }
          | null = null;

        for (const layer of LAYERS) {
          const payload = await wfsGetFeatureGeoJson(layer, bbox);
          if (!payload) continue;

          const pick = extractBestTransactionFromPayload(payload, layer);
          if (pick && (pick.price != null || pick.dateISO != null)) {
            best = pick as any;
            break;
          }
        }

        const link = buildGeoportalLink(r0.lat, r0.lng);

        await pool.query(
          `
          UPDATE external_listings
          SET
            rcn_last_price = COALESCE($1, rcn_last_price),
            rcn_last_date = COALESCE($2::date, rcn_last_date),
            rcn_last_source_id = COALESCE($6, rcn_last_source_id),
            rcn_link = $3,
            rcn_enriched_at = now(),
            updated_at = now()
          WHERE office_id = $4 AND id = $5
          `,
          [best?.price ?? null, best?.dateISO ?? null, link, officeId, r0.id, best?.sourceId ?? null]
        );

        processed += 1;
        debug.push({ id: r0.id, ...(best?.detected ?? {}), price: best?.price ?? null, dateISO: best?.dateISO ?? null });

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
      retryHours,
      force,
      errors,
      debug,
    });
  } catch (e: any) {
    console.error("EVERYBOT_RCN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}