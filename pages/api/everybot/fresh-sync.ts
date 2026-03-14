// pages/api/everybot/fresh-sync.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { adapterRegistry } from "../../../lib/everybot/adapters";
import type { SourceKey } from "../../../lib/everybot/enrichers/types";
import { normalizeFilters } from "../../../lib/everybot/filters/normalize";

const ALL_SOURCES: SourceKey[] = [
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

function getRequestedSources(source?: "all" | SourceKey): SourceKey[] {
  if (!source || source === "all") return ALL_SOURCES;
  return ALL_SOURCES.includes(source) ? [source] : ALL_SOURCES;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = String(req.headers["authorization"] || "");
    const secret =
      process.env.EVERYBOT_CRON_SECRET ||
      process.env.CRON_SECRET ||
      "";

    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId =
      typeof req.body?.officeId === "string" ? req.body.officeId.trim() : "";

    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const filters = normalizeFilters(req.body?.filters ?? {});
    const runTs = new Date().toISOString();
    const sources = getRequestedSources(filters.source);

    let inserted = 0;
    let parsed = 0;
    const errors: Array<{
      source: string;
      page: number;
      url?: string | null;
      error: string;
    }> = [];

    outer:
    for (const source of sources) {
      const adapter = adapterRegistry[source];

      if (!adapter) {
        errors.push({
          source,
          page: 0,
          url: null,
          error: "MISSING_ADAPTER",
        });
        continue;
      }

      for (let page = 1; page <= MAX_PAGES; page++) {
        const ctx = { filters, page };

        let reqDef: ReturnType<typeof adapter.buildSearchRequest>;
        try {
          reqDef = adapter.buildSearchRequest(ctx);
        } catch (e: any) {
          errors.push({
            source,
            page,
            url: null,
            error: e?.message ?? "BUILD_SEARCH_REQUEST_FAILED",
          });
          break;
        }

        try {
          const r = await fetch(reqDef.url, {
            method: reqDef.method,
            headers: reqDef.headers,
            redirect: "follow",
          });

          const html = await r.text().catch(() => "");
          const finalUrl = r.url || reqDef.url;

          if (!r.ok) {
            errors.push({
              source,
              page,
              url: reqDef.url,
              error: `FETCH_FAILED ${r.status} ${r.statusText}`,
            });
            break;
          }

          const result = adapter.parseSearch(ctx, html, finalUrl);

          console.log("EVERYBOT_FRESH_SYNC_PAGE", {
            officeId,
            source,
            page,
            requestedUrl: reqDef.url,
            finalUrl,
            applied: result.meta?.applied ?? null,
            degradedReason: result.meta?.degradedReason ?? null,
            items: result.items.length,
            hasNext: result.hasNext,
          });

          if (!result.meta.applied) {
            break;
          }

          for (const item of result.items) {
            parsed += 1;

            const sourceListingId = item.source_url;

            const rawJson = JSON.stringify({
              stage: "fresh-sync",
              source,
              requestedUrl: reqDef.url,
              finalUrl,
              page,
              fetchedAt: runTs,
              degradedReason: result.meta?.degradedReason ?? "none",
            });

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
                last_seen_at,
                source_status,
                updated_at
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,
                $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21::jsonb,
                'preview',
                $22,
                now(),
                now(),
                'active',
                now()
              )
                ON CONFLICT ON CONSTRAINT ux_external_listings_office_url
                DO UPDATE SET
                source_url = EXCLUDED.source_url,
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
                raw = CASE
                        WHEN external_listings.raw IS NULL OR external_listings.raw = '{}'::jsonb THEN EXCLUDED.raw
                        ELSE external_listings.raw || EXCLUDED.raw
                      END,
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
                rawJson,
                runTs,
              ]
            );

            inserted += 1;

            if (inserted >= UPSERT_LIMIT) {
              break outer;
            }
          }

          if (!result.hasNext) {
            break;
          }

          await sleep(500);
        } catch (e: any) {
          errors.push({
            source,
            page,
            url: reqDef.url,
            error: e?.message ?? "UNKNOWN_FRESH_SYNC_ERROR",
          });
          console.error("EVERYBOT_FRESH_SYNC_SOURCE_ERROR", {
            officeId,
            source,
            page,
            url: reqDef.url,
            error: e?.message ?? e,
          });
          break;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      officeId,
      parsed,
      inserted,
      sources,
      errors,
    });
  } catch (e: any) {
    console.error("EVERYBOT_FRESH_SYNC_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}