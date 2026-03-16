import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type Scope = "office" | "global";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const scope = (optString(req.query.scope) === "global" ? "global" : "office") as Scope;

    let officeId: string | null = null;

    if (scope === "office") {
      officeId = await getOfficeIdForUserId(userId);
      if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const whereSql = scope === "office" ? `WHERE office_id = $1::uuid` : ``;
    const params = scope === "office" && officeId ? [officeId] : [];

    const sql = `
      SELECT
        COUNT(*)::int AS all_listings,
        COUNT(*) FILTER (
          WHERE owner_phone IS NOT NULL AND btrim(owner_phone) <> ''
        )::int AS with_phone,
        COUNT(*) FILTER (
          WHERE owner_phone IS NULL OR btrim(owner_phone) = ''
        )::int AS without_phone,
        COUNT(*) FILTER (
          WHERE
            owner_phone IS NOT NULL
            AND btrim(owner_phone) <> ''
            AND updated_at >= date_trunc('day', now())
        )::int AS filled_today_by_updated_at,
        COUNT(*) FILTER (
          WHERE
            owner_phone IS NOT NULL
            AND btrim(owner_phone) <> ''
            AND enriched_at IS NOT NULL
            AND enriched_at >= date_trunc('day', now())
        )::int AS filled_today_by_enriched_at,
        COUNT(*) FILTER (
          WHERE
            last_checked_at IS NOT NULL
            AND last_checked_at >= date_trunc('day', now())
        )::int AS checked_today_by_last_checked_at,
        MAX(updated_at)::timestamptz AS last_update_at,
        MAX(enriched_at)::timestamptz AS last_enriched_at,
        MAX(last_checked_at)::timestamptz AS last_checked_at
      FROM external_listings
      ${whereSql}
    `;

    const result = await pool.query(sql, params);
    const row = result.rows[0] ?? {};

    const allListings = Number(row.all_listings ?? 0);
    const withPhone = Number(row.with_phone ?? 0);
    const withoutPhone = Number(row.without_phone ?? 0);
    const filledTodayByUpdatedAt = Number(row.filled_today_by_updated_at ?? 0);
    const filledTodayByEnrichedAt = Number(row.filled_today_by_enriched_at ?? 0);
    const checkedTodayByLastCheckedAt = Number(row.checked_today_by_last_checked_at ?? 0);

    const effectivenessPercent =
      allListings > 0 ? Math.round((withPhone / allListings) * 100) : 0;

    return res.status(200).json({
      scope,
      officeId: scope === "office" ? officeId : null,
      allListings,
      withPhone,
      withoutPhone,
      filledTodayByUpdatedAt,
      filledTodayByEnrichedAt,
      checkedTodayByLastCheckedAt,
      lastUpdateAt: row.last_update_at ?? null,
      lastEnrichedAt: row.last_enriched_at ?? null,
      lastCheckedAt: row.last_checked_at ?? null,
      effectivenessPercent,
    });
  } catch (e: any) {
    console.error("PHONE_BACKFILL_STATS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}