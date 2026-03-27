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

type CreditOrderRow = {
  id: string;
  office_id: string;
  party_id: string;
  case_type: string;
  status: string;
  client_bucket: string;
  assigned_user_id: string | null;
  created_by_user_id: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  full_name: string | null;

  credited_property_price: number | null;
  planned_own_contribution: number | null;
  loan_period_months: number | null;
  concerns_existing_property: boolean | null;
  related_offer_id: string | null;
  existing_property_notes: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const clientId = optString(req.query.clientId);
    const limit = Math.min(optInt(req.query.limit, 100), 200);

    const params: Array<string | number> = [officeId];
    let idx = 2;

    let where = `
      WHERE cc.office_id = $1
        AND cc.case_type = 'credit'
    `;

    if (clientId) {
      where += ` AND cc.party_id = $${idx}`;
      params.push(clientId);
      idx++;
    }

    params.push(limit);

    const sql = `
      SELECT
        cc.id::text AS id,
        cc.office_id::text AS office_id,
        cc.party_id::text AS party_id,
        cc.case_type::text AS case_type,
        cc.status::text AS status,
        cc.client_bucket,
        cc.assigned_user_id::text AS assigned_user_id,
        cc.created_by_user_id::text AS created_by_user_id,
        cc.source,
        cc.notes,
        cc.created_at,
        cc.updated_at,
        p.full_name,

        ccd.credited_property_price,
        ccd.planned_own_contribution,
        ccd.loan_period_months,
        ccd.concerns_existing_property,
        ccd.related_offer_id::text AS related_offer_id,
        ccd.existing_property_notes

      FROM public.client_cases cc
      LEFT JOIN public.parties p
        ON p.id = cc.party_id
       AND p.office_id = cc.office_id
      LEFT JOIN public.client_case_credit_details ccd
        ON ccd.client_case_id = cc.id
       AND ccd.office_id = cc.office_id

      ${where}

      ORDER BY
        COALESCE(cc.updated_at, cc.created_at) DESC,
        cc.created_at DESC

      LIMIT $${params.length}
    `;

    const { rows } = await pool.query<CreditOrderRow>(sql, params);

    const normalized = rows.map((row) => ({
      ...row,
      created_at:
        row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at:
        row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }));

    return res.status(200).json({ rows: normalized });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CREDIT_ORDERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}