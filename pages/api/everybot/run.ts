import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";
import { adapterRegistry } from "../../../lib/everybot/adapters";
import { EverybotSource } from "../../../lib/everybot/adapters/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
 if (req.method !== "POST" && req.method !== "GET") {
  res.setHeader("Allow", "POST, GET");
  return res.status(405).json({ error: "Method not allowed" });
}

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

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

      const results = await adapter(source);

      for (const r of results) {
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
            status
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
          )
          ON CONFLICT (office_id, source, source_listing_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            price_amount = EXCLUDED.price_amount,
            location_text = EXCLUDED.location_text,
            status = EXCLUDED.status,
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
    }

    return res.status(200).json({
      ok: true,
      sources: sources.length,
      listings_processed: inserted,
    });
  } catch (e: any) {
    console.error("EVERYBOT_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
