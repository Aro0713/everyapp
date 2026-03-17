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

function normalizeClientRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed || trimmed === "{}") return [];

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }
  }

  return [];
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
    const partyType = optString(req.query.partyType);
    const clientRole = optString(req.query.clientRole);
    const status = optString(req.query.status);
    const pipelineStage = optString(req.query.pipelineStage);
    const limit = Math.min(optInt(req.query.limit, 50), 200);

    const params: any[] = [officeId];
    let idx = 2;

    const where: string[] = [`c.office_id = $1`];

    if (partyType) {
      where.push(`c.party_type::text = $${idx}`);
      params.push(partyType);
      idx++;
    }

    if (clientRole) {
      where.push(`$${idx} = ANY(c.client_roles)`);
      params.push(clientRole);
      idx++;
    }

    if (status) {
      where.push(`c.status::text = $${idx}`);
      params.push(status);
      idx++;
    }

    if (pipelineStage) {
      where.push(`c.pipeline_stage::text = $${idx}`);
      params.push(pipelineStage);
      idx++;
    }

    if (q.length >= 2) {
      where.push(`
        (
          c.full_name ILIKE '%' || $${idx} || '%'
          OR coalesce(c.first_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(c.last_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(c.company_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(c.phone, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(c.email, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(c.pesel, '') = $${idx}
          OR coalesce(c.nip, '') = $${idx}
          OR coalesce(c.regon, '') = $${idx}
          OR coalesce(c.krs, '') = $${idx}
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      SELECT
        c.id,
        c.office_id,
        c.party_type::text AS party_type,
        c.full_name,
        c.notes,
        c.source,
        c.created_by_user_id,
        c.assigned_user_id,
        c.status::text AS status,
        c.pipeline_stage::text AS pipeline_stage,
        c.created_at,
        c.updated_at,

        c.first_name,
        c.last_name,
        c.pesel,

        c.company_name,
        c.nip,
        c.regon,
        c.krs,

        c.phone,
        c.email,

        c.client_roles,
        c.has_interactions,
        c.interactions_count

      FROM public.crm_contacts_view c
      WHERE ${where.join(" AND ")}
      ORDER BY c.updated_at DESC, c.created_at DESC, c.full_name ASC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    const normalized = rows.map((row) => {
      const clientRoles = normalizeClientRoles(row.client_roles);

      return {
        ...row,
        client_roles: clientRoles,
        has_interactions:
          typeof row.has_interactions === "boolean"
            ? row.has_interactions
            : Number(row.interactions_count ?? 0) > 0,
        interactions_count: Number(row.interactions_count ?? 0),
        phone_primary: row.phone ?? null,
        email_primary: row.email ?? null,
        phone_fallback: row.phone ?? null,
        email_fallback: row.email ?? null,
        contacts_count: [row.phone, row.email].filter(Boolean).length,
      };
    });

    return res.status(200).json({ rows: normalized });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}