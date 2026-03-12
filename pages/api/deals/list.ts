import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optInt(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);

    const q = optString(req.query.q) ?? "";
    const transactionType = optString(req.query.transactionType);
    const limit = Math.min(optInt(req.query.limit, 50), 200);

    const params: any[] = [officeId];
    let idx = params.length + 1;

    const where: string[] = [`la.office_id = $1`];

    if (transactionType) {
      where.push(`la.transaction_type = $${idx}`);
      params.push(transactionType);
      idx++;
    }

    if (q.length >= 2) {
      where.push(`
        (
          la.title ILIKE '%' || $${idx} || '%'
          OR la.location_text ILIKE '%' || $${idx} || '%'
          OR EXISTS (
            SELECT 1
            FROM listing_parties lpq
            JOIN parties pq ON pq.id = lpq.party_id
            WHERE lpq.listing_id = la.original_listing_id
              AND pq.full_name ILIKE '%' || $${idx} || '%'
          )
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      SELECT
        la.id,
        la.original_listing_id,
        la.office_id,
        la.archived_by_user_id,
        la.archived_at,
        la.record_type,
        la.transaction_type,
        la.status,
        la.created_by_user_id,
        la.case_owner_user_id,
        la.contract_type,
        la.market,
        la.currency,
        la.price_amount,
        la.location_text,
        la.title,
        la.description,
        la.property_type,
        la.area_m2,
        la.rooms,
        la.floor,
        la.year_built,
        la.voivodeship,
        la.city,
        la.district,
        la.street,
        la.created_at,
        la.updated_at,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'party_id', p.id,
              'full_name', p.full_name,
              'role', lp.role::text,
              'is_primary', lp.is_primary
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS parties

      FROM listing_archives la
      LEFT JOIN listing_parties lp
        ON lp.listing_id = la.original_listing_id
      LEFT JOIN parties p
        ON p.id = lp.party_id

      WHERE ${where.join(" AND ")}

      GROUP BY
        la.id,
        la.original_listing_id,
        la.office_id,
        la.archived_by_user_id,
        la.archived_at,
        la.record_type,
        la.transaction_type,
        la.status,
        la.created_by_user_id,
        la.case_owner_user_id,
        la.contract_type,
        la.market,
        la.currency,
        la.price_amount,
        la.location_text,
        la.title,
        la.description,
        la.property_type,
        la.area_m2,
        la.rooms,
        la.floor,
        la.year_built,
        la.voivodeship,
        la.city,
        la.district,
        la.street,
        la.created_at,
        la.updated_at

      ORDER BY la.archived_at DESC NULLS LAST, la.created_at DESC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("DEALS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}