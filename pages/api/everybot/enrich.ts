// pages/api/everybot/enrich.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";
import { enrichRegistry, type SourceKey } from "../../../lib/everybot/enrichers";

type ExternalListingRow = {
  id: string;
  office_id: string;
  source: string;
  source_url: string;
  source_status: string | null;
};

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function toSourceKey(s: string): SourceKey | null {
  const v = (s || "").toLowerCase();
  if (v === "otodom") return "otodom";
  if (v === "olx") return "olx";
  if (v === "no" || v === "nieruchomosci-online" || v === "nieruchomoscisonline") return "no";
  if (v === "gratka") return "gratka";
  if (v === "morizon") return "morizon";
  if (v === "owner" || v === "od_wlasciciela" || v === "od-wlasciciela") return "owner";
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "POST, GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    if (req.method === "GET") {
      return res.status(200).json({ ok: true, officeId });
    }

    // POST
    const body = req.body ?? {};
    const limitRaw = optNumber(body.limit) ?? 25;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    // opcjonalnie: wymuś enrich konkretnego rekordu
    const onlyId = optString(body.id);
    const onlyUrl = optString(body.url);

    const { rows } = await pool.query<ExternalListingRow>(
      onlyId
        ? `
          SELECT id, office_id, source, source_url, source_status
          FROM external_listings
          WHERE office_id = $1 AND id = $2
          LIMIT 1
        `
        : onlyUrl
        ? `
          SELECT id, office_id, source, source_url, source_status
          FROM external_listings
          WHERE office_id = $1 AND source_url = $2
          ORDER BY updated_at DESC
          LIMIT 1
        `
        : `
          SELECT id, office_id, source, source_url, source_status
          FROM external_listings
          WHERE office_id = $1
            AND COALESCE(source_status, 'unknown') <> 'removed'
            AND (
              enriched_at IS NULL
              OR thumb_url IS NULL
              OR transaction_type IS NULL
              OR area_m2 IS NULL
              OR rooms IS NULL
              OR city IS NULL
              OR district IS NULL
              OR street IS NULL
              OR floor IS NULL
              OR year_built IS NULL
              OR property_type IS NULL
            )
          ORDER BY enriched_at NULLS FIRST, last_seen_at DESC NULLS LAST, updated_at DESC
          LIMIT $2
        `,
      onlyId || onlyUrl ? [officeId, (onlyId ?? onlyUrl)!] : [officeId, limit]
    );

    if (!rows.length) {
      return res.status(200).json({ ok: true, processed: 0, message: "Nothing to enrich" });
    }

    let processed = 0;
    const errors: Array<{ id: string; source: string; url: string; error: string }> = [];

    // Sekwencyjnie (bezpiecznie dla portali). Jak zechcesz, zrobimy concurrency+limiter.
    for (const r of rows) {
      const sourceKey = toSourceKey(r.source);
      if (!sourceKey) {
        errors.push({
          id: r.id,
          source: r.source,
          url: r.source_url,
          error: "Unsupported source",
        });
        continue;
      }

      const enricher = enrichRegistry[sourceKey];
      if (!enricher) {
        errors.push({
          id: r.id,
          source: r.source,
          url: r.source_url,
          error: "Missing enricher",
        });
        continue;
      }

      try {
        const data = await enricher(r.source_url);

        // Aktualizuj tylko tym, co przyszło (COALESCE: jeśli null/undefined -> zostaw starą wartość)
await pool.query(
  `
  UPDATE external_listings
  SET
    thumb_url        = COALESCE($1, thumb_url),
    matched_at       = COALESCE($2, matched_at),

    transaction_type = COALESCE($3, transaction_type),
    property_type    = COALESCE($4, property_type),

    price_amount     = COALESCE($5, price_amount),
    currency         = COALESCE($6, currency),

    area_m2          = COALESCE($7, area_m2),
    price_per_m2     = COALESCE($8, price_per_m2),
    rooms            = COALESCE($9, rooms),

    floor            = COALESCE($10, floor),
    year_built       = COALESCE($11, year_built),

    voivodeship      = COALESCE($12, voivodeship),
    city             = COALESCE($13, city),
    district         = COALESCE($14, district),
    street           = COALESCE($15, street),

    owner_phone      = COALESCE($16, owner_phone),

    location_text    = COALESCE($17, location_text),
    title            = COALESCE($18, title),
    description      = COALESCE($19, description),

    source_status    = COALESCE(NULLIF(source_status, ''), 'active'),
    enriched_at      = now(),
    updated_at       = now()
  WHERE office_id = $20 AND id = $21
`,
  [
    data.thumb_url ?? null,
    data.matched_at ?? null,

    data.transaction_type ?? null,
    data.property_type ?? null,

    data.price_amount ?? null,
    data.currency ?? null,

    data.area_m2 ?? null,
    data.price_per_m2 ?? null,
    data.rooms ?? null,

    data.floor ?? null,
    data.year_built ?? null,

    data.voivodeship ?? null,
    data.city ?? null,
    data.district ?? null,
    data.street ?? null,

    data.owner_phone ?? null,

    data.location_text ?? null,
    data.title ?? null,
    data.description ?? null,

    officeId,
    r.id,
  ]
);

        processed += 1;

        // mały “oddech” żeby nie walić jak karabin
        await sleep(250);
      } catch (e: any) {
        errors.push({
          id: r.id,
          source: r.source,
          url: r.source_url,
          error: e?.message ?? "Enrich failed",
        });
      }
    }

    return res.status(200).json({
      ok: true,
      officeId,
      requested: limit,
      processed,
      errors,
    });
  } catch (e: any) {
    console.error("EVERYBOT_ENRICH_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
