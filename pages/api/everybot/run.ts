import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";
import { adapterRegistry } from "../../../lib/everybot/adapters";
import { EverybotSource } from "../../../lib/everybot/adapters/types";

function getBaseUrl(req: NextApiRequest) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers.host as string) ||
    "localhost:3000";
  return `${proto}://${host}`;
}

async function callInternal(
  req: NextApiRequest,
  path: string,
  body: any
): Promise<any> {
  const base = getBaseUrl(req);
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // przenieś sesję użytkownika (auth oparty o cookie)
      cookie: req.headers.cookie || "",
    },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `${path} HTTP ${r.status}`);
  return j;
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

    // GET – healthcheck
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, officeId });
    }

    // POST params (bezpieczne defaulty)
    const body = req.body ?? {};
    const harvestPages = Math.min(Math.max(Number(body.harvestPages ?? 5), 1), 5);
    const harvestLimit = Math.min(Math.max(Number(body.harvestLimit ?? 50), 1), 50);

    const enrichLimit = Math.min(Math.max(Number(body.enrichLimit ?? 50), 1), 100);
    const enrichRounds = Math.min(Math.max(Number(body.enrichRounds ?? 6), 1), 10);

    const verifyLimit = Math.min(Math.max(Number(body.verifyLimit ?? 100), 1), 200);
    const verifyRounds = Math.min(Math.max(Number(body.verifyRounds ?? 2), 1), 10);

    // --- 1) Harvest via adapters (to co masz)
    const { rows: sources } = await pool.query<EverybotSource>(
      `
      SELECT *
      FROM everybot_sources
      WHERE office_id = $1
        AND enabled = true
      `,
      [officeId]
    );

    let inserted = 0;

    for (const source of sources) {
      const adapter = adapterRegistry[source.adapter];
      if (!adapter) continue;

      try {
        // adapter niech wewnętrznie respektuje harvestPages/harvestLimit jeśli ma (jeśli nie – i tak ok)
        const results = await adapter({ ...source, pages: harvestPages, limit: harvestLimit } as any);

        for (const r of results) {
          // ✅ filtr śmieci – bez tytułu nie zapisujemy
          if (!r?.source_url || !r?.source_listing_id) continue;
          if (!r?.title || !String(r.title).trim()) continue;

          await pool.query(
            `
            INSERT INTO external_listings (
              office_id,
              source,
              source_listing_id,
              source_url,
              title,
              description,
              price_amount,
              currency,
              location_text,
              status,

              thumb_url,
              matched_at,
              transaction_type,
              area_m2,
              price_per_m2,
              rooms,
              floor,
              year_built,
              voivodeship,
              city,
              district,
              street,
              property_type,
              owner_phone
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
            )
            ON CONFLICT (office_id, source, source_listing_id)
            DO UPDATE SET
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              price_amount = EXCLUDED.price_amount,
              currency = EXCLUDED.currency,
              location_text = EXCLUDED.location_text,
              status = EXCLUDED.status,

              thumb_url = EXCLUDED.thumb_url,
              matched_at = EXCLUDED.matched_at,
              transaction_type = EXCLUDED.transaction_type,
              area_m2 = EXCLUDED.area_m2,
              price_per_m2 = EXCLUDED.price_per_m2,
              rooms = EXCLUDED.rooms,
              floor = EXCLUDED.floor,
              year_built = EXCLUDED.year_built,
              voivodeship = EXCLUDED.voivodeship,
              city = EXCLUDED.city,
              district = EXCLUDED.district,
              street = EXCLUDED.street,
              property_type = EXCLUDED.property_type,
              owner_phone = EXCLUDED.owner_phone,

              updated_at = now()
            `,
            [
              officeId,
              r.source,
              r.source_listing_id,
              r.source_url,
              r.title ?? null,
              r.description ?? null,
              r.price_amount ?? null,
              r.currency ?? null,
              r.location_text ?? null,
              r.status ?? "active",

              r.thumb_url ?? null,
              r.matched_at ?? null,
              r.transaction_type ?? null,
              r.area_m2 ?? null,
              r.price_per_m2 ?? null,
              r.rooms ?? null,
              r.floor ?? null,
              r.year_built ?? null,
              r.voivodeship ?? null,
              r.city ?? null,
              r.district ?? null,
              r.street ?? null,
              r.property_type ?? null,
              r.owner_phone ?? null,
            ]
          );

          inserted++;
        }

        await pool.query(
          `
          UPDATE everybot_sources
          SET last_crawled_at = now(),
              last_status = 'ok'
          WHERE id = $1
          `,
          [source.id]
        );
      } catch (e: any) {
        await pool.query(
          `
          UPDATE everybot_sources
          SET last_crawled_at = now(),
              last_status = 'error'
          WHERE id = $1
          `,
          [source.id]
        );
        // nie przerywamy całego run – idziemy dalej
        console.error("EVERYBOT_RUN_ADAPTER_ERROR", source.adapter, e?.message ?? e);
      }
    }

    // --- 2) Enrich loop (aż processed=0 lub max rounds)
    let enrichTotal = 0;
    for (let i = 0; i < enrichRounds; i++) {
      const j = await callInternal(req, "/api/everybot/enrich", { limit: enrichLimit });
      const processed = Number(j?.processed ?? 0);
      if (!Number.isFinite(processed) || processed <= 0) break;
      enrichTotal += processed;
    }

    // --- 3) Verify loop
    let verifyTotal = 0;
    for (let i = 0; i < verifyRounds; i++) {
      const j = await callInternal(req, "/api/everybot/verify", { limit: verifyLimit });
      const processed = Number(j?.processed ?? 0);
      if (!Number.isFinite(processed) || processed <= 0) break;
      verifyTotal += processed;
    }

    return res.status(200).json({
      ok: true,
      sources: sources.length,
      harvested_upserts: inserted,
      enrich_total: enrichTotal,
      verify_total: verifyTotal,
      config: {
        harvestPages,
        harvestLimit,
        enrichLimit,
        enrichRounds,
        verifyLimit,
        verifyRounds,
      },
    });
  } catch (e: any) {
    console.error("EVERYBOT_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
