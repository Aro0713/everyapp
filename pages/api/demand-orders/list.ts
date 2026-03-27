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
    mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const clientId = optString(req.query.clientId);
    const limit = Math.min(optInt(req.query.limit, 100), 200);

    const params: Array<string | number> = [officeId];
    let idx = 2;

    const where: string[] = [
      `cc.office_id = $1`,
      `cc.case_type IN ('buyer', 'tenant')`,
    ];

    if (clientId) {
      where.push(`cc.party_id = $${idx}`);
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

        c.full_name,
        c.party_type::text AS party_type,
        c.phone,
        c.email,
        c.client_roles,

        od.property_kind::text AS property_kind,
        od.market_type::text AS market_type,
        od.contract_type::text AS contract_type,
        od.caretaker_user_id::text AS caretaker_user_id,
        od.expected_property_kind::text AS expected_property_kind,
        od.search_location_text,
        od.budget_min,
        od.budget_max,
        od.rooms_min,
        od.rooms_max,
        od.area_min,
        od.area_max,

        vr.visibility_scope::text AS visibility_scope

      FROM public.client_cases cc
      LEFT JOIN public.crm_contacts_view c
        ON c.id = cc.party_id
       AND c.office_id = cc.office_id
      LEFT JOIN public.client_case_order_details od
        ON od.client_case_id = cc.id
       AND od.office_id = cc.office_id
      LEFT JOIN public.client_case_visibility_rules vr
        ON vr.client_case_id = cc.id
       AND vr.office_id = cc.office_id
      WHERE ${where.join(" AND ")}
      ORDER BY
        COALESCE(cc.updated_at, cc.created_at) DESC,
        cc.created_at DESC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    return res.status(200).json({
      rows: rows.map((row) => ({
        ...row,
        client_roles: Array.isArray(row.client_roles)
          ? row.client_roles
          : typeof row.client_roles === "string" && row.client_roles.startsWith("{")
            ? row.client_roles
                .slice(1, -1)
                .split(",")
                .map((x: string) => x.trim().replace(/^"(.*)"$/, "$1"))
                .filter(Boolean)
            : [],
      })),
      meta: {
        officeId,
        clientId,
        limit,
        count: rows.length,
      },
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("DEMAND_ORDERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}