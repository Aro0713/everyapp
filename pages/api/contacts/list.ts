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
    const caseType = optString(req.query.caseType);
    const clientBucket = optString(req.query.clientBucket);
    const visibilityScope = optString(req.query.visibilityScope);
    const assignedUserId = optString(req.query.assignedUserId);
    const limit = Math.min(optInt(req.query.limit, 50), 200);

    const params: any[] = [officeId];
    let idx = 2;

    const where: string[] = [`base.office_id = $1`];

    if (partyType) {
      where.push(`base.party_type::text = $${idx}`);
      params.push(partyType);
      idx++;
    }

    if (clientRole) {
      where.push(`$${idx} = ANY(base.client_roles)`);
      params.push(clientRole);
      idx++;
    }

    if (status) {
      where.push(`base.status::text = $${idx}`);
      params.push(status);
      idx++;
    }

    if (pipelineStage) {
      where.push(`base.pipeline_stage::text = $${idx}`);
      params.push(pipelineStage);
      idx++;
    }

    if (caseType) {
      where.push(`coalesce(base.case_type::text, '') = $${idx}`);
      params.push(caseType);
      idx++;
    }

    if (clientBucket) {
      where.push(`coalesce(base.client_bucket, '') = $${idx}`);
      params.push(clientBucket);
      idx++;
    }

    if (visibilityScope) {
      where.push(`coalesce(base.visibility_scope::text, '') = $${idx}`);
      params.push(visibilityScope);
      idx++;
    }

    if (assignedUserId) {
      where.push(`coalesce(base.assigned_user_id::text, '') = $${idx}`);
      params.push(assignedUserId);
      idx++;
    }

    if (q.length >= 2) {
      where.push(`
        (
          base.full_name ILIKE '%' || $${idx} || '%'
          OR coalesce(base.first_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.last_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.company_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.phone, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.email, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.pesel, '') = $${idx}
          OR coalesce(base.nip, '') = $${idx}
          OR coalesce(base.regon, '') = $${idx}
          OR coalesce(base.krs, '') = $${idx}
          OR coalesce(base.case_type::text, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.client_bucket, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.assigned_user_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.created_by_user_name, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(base.assigned_office_name, '') ILIKE '%' || $${idx} || '%'
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      WITH primary_cases AS (
        SELECT
          cc.id,
          cc.office_id,
          cc.party_id,
          cc.case_type,
          cc.status AS case_status,
          cc.assigned_user_id AS case_assigned_user_id,
          cc.created_by_user_id AS case_created_by_user_id,
          cc.source AS case_source,
          cc.notes AS case_notes,
          cc.client_bucket,
          cc.created_at AS case_created_at,
          cc.updated_at AS case_updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY cc.party_id
            ORDER BY
             CASE WHEN cc.status = 'active' THEN 0 ELSE 1 END,
              cc.created_at ASC
          ) AS rn
        FROM public.client_cases cc
        WHERE cc.office_id = $1
      ),
      base AS (
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
          c.interactions_count,

          pc.id AS client_case_id,
          pc.case_type,
          pc.case_status::text AS client_case_status,
          pc.client_bucket,
          pc.case_created_at,
          pc.case_updated_at,

          vr.visibility_scope::text AS visibility_scope,
          vr.owner_user_id,
          vr.owner_membership_id,

          assigned_mem.full_name AS assigned_user_name,
          created_mem.full_name AS created_by_user_name,
          office_assigned.name AS assigned_office_name
        FROM public.crm_contacts_view c
        LEFT JOIN primary_cases pc
          ON pc.party_id = c.id
         AND pc.office_id = c.office_id
         AND pc.rn = 1
        LEFT JOIN public.client_case_visibility_rules vr
          ON vr.client_case_id = pc.id
         AND vr.office_id = c.office_id
        LEFT JOIN public.memberships assigned_mem
          ON assigned_mem.user_id = coalesce(pc.case_assigned_user_id, c.assigned_user_id)
         AND assigned_mem.office_id = c.office_id
        LEFT JOIN public.memberships created_mem
          ON created_mem.user_id = coalesce(pc.case_created_by_user_id, c.created_by_user_id)
         AND created_mem.office_id = c.office_id
        LEFT JOIN public.offices office_assigned
          ON office_assigned.id = assigned_mem.office_id
      )
      SELECT
        base.id,
        base.office_id,
        base.party_type,
        base.full_name,
        base.notes,
        base.source,
        base.created_by_user_id,
        base.assigned_user_id,
        base.status,
        base.pipeline_stage,
        base.created_at,
        base.updated_at,

        base.first_name,
        base.last_name,
        base.pesel,

        base.company_name,
        base.nip,
        base.regon,
        base.krs,

        base.phone,
        base.email,

        base.client_roles,
        base.has_interactions,
        base.interactions_count,

        base.client_case_id,
        base.case_type::text AS case_type,
        base.client_case_status,
        base.client_bucket,
        base.case_created_at,
        base.case_updated_at,

        base.visibility_scope,
        base.owner_user_id,
        base.owner_membership_id,

        base.assigned_user_name,
        base.created_by_user_name,
        base.assigned_office_name
      FROM base
      WHERE ${where.join(" AND ")}
      ORDER BY
        coalesce(base.case_updated_at, base.updated_at) DESC,
        coalesce(base.case_created_at, base.created_at) DESC,
        base.full_name ASC
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