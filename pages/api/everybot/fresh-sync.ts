// pages/api/everybot/fresh-sync.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { adapterRegistry } from "../../../lib/everybot/adapters";
import type { SourceKey } from "../../../lib/everybot/enrichers/types";
import { normalizeFilters } from "../../../lib/everybot/filters/normalize";

const SOURCES: SourceKey[] = [
  "otodom",
  "olx",
  "gratka",
  "morizon",
  "odwlasciciela",
];

const MAX_PAGES = 3;
const UPSERT_LIMIT = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = String(req.headers["authorization"] || "");
    const secret = process.env.EVERYBOT_CRON_SECRET || "";

    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = typeof req.body?.officeId === "string" ? req.body.officeId.trim() : "";
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const filters = normalizeFilters(req.body?.filters ?? {});
    const runTs = new Date().toISOString();

    let inserted = 0;
    let parsed = 0;

    outer:
    for (const source of SOURCES) {
      const adapter = adapterRegistry[source];
      if (!adapter) continue;

      for (let page = 1; page <= MAX_PAGES; page++) {
        const ctx = { filters, page };

        const reqDef = adapter.buildSearchRequest(ctx);

        const r = await fetch(reqDef.url, {
          method: reqDef.method,
          headers: reqDef.headers,
          redirect: "follow",
        });

        const html = await r.text();
        const finalUrl = r.url;

        const result = adapter.parseSearch(ctx, html, finalUrl);

        if (!result.meta.applied) break;

        for (const item of result.items) {
          parsed++;

          const sourceListingId = item.source_url;

          await pool.query(
            `
            INSERT INTO external_listings (
              office_id,
              source,
              source_listing_id,
              source_url,
              title,
              price_amount,
              currency,
              location_text,
              thumb_url,
              transaction_type,
              property_type,
              area_m2,
              price_per_m2,
              rooms,
              floor,
              year_built,
              voivodeship,
              city,
              district,
              street,
              raw,
              status,
              matched_at,
              first_seen_at,
              last_seen_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,
              $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              '{}'::jsonb,
              'preview',
              $21,
              now(),
              now()
            )
            ON CONFLICT (office_id, source, source_listing_id)
            DO UPDATE SET
              title = COALESCE(EXCLUDED.title, external_listings.title),
              price_amount = COALESCE(EXCLUDED.price_amount, external_listings.price_amount),
              currency = COALESCE(EXCLUDED.currency, external_listings.currency),
              location_text = COALESCE(EXCLUDED.location_text, external_listings.location_text),
              thumb_url = COALESCE(EXCLUDED.thumb_url, external_listings.thumb_url),
              transaction_type = COALESCE(EXCLUDED.transaction_type, external_listings.transaction_type),
              property_type = COALESCE(EXCLUDED.property_type, external_listings.property_type),
              area_m2 = COALESCE(EXCLUDED.area_m2, external_listings.area_m2),
              price_per_m2 = COALESCE(EXCLUDED.price_per_m2, external_listings.price_per_m2),
              rooms = COALESCE(EXCLUDED.rooms, external_listings.rooms),
              floor = COALESCE(EXCLUDED.floor, external_listings.floor),
              year_built = COALESCE(EXCLUDED.year_built, external_listings.year_built),
              voivodeship = COALESCE(EXCLUDED.voivodeship, external_listings.voivodeship),
              city = COALESCE(EXCLUDED.city, external_listings.city),
              district = COALESCE(EXCLUDED.district, external_listings.district),
              street = COALESCE(EXCLUDED.street, external_listings.street),
              matched_at = EXCLUDED.matched_at,
              last_seen_at = now(),
              source_status = 'active',
              updated_at = now()
            `,
            [
              officeId,
              item.source,
              sourceListingId,
              item.source_url,
              item.title ?? null,
              item.price_amount ?? null,
              item.currency ?? null,
              item.location_text ?? null,
              item.thumb_url ?? null,
              item.transaction_type ?? null,
              item.property_type ?? null,
              item.area_m2 ?? null,
              item.price_per_m2 ?? null,
              item.rooms ?? null,
              item.floor ?? null,
              item.year_built ?? null,
              item.voivodeship ?? null,
              item.city ?? null,
              item.district ?? null,
              item.street ?? null,
              runTs,
            ]
          );

          inserted++;

          if (inserted >= UPSERT_LIMIT) {
            break outer;
          }
        }

        if (!result.hasNext) break;

        await sleep(500);
      }
    }

    return res.status(200).json({
      ok: true,
      parsed,
      inserted,
    });
  } catch (e: any) {
    console.error("EVERYBOT_FRESH_SYNC_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}