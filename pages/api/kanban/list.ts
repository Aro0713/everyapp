import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type KanbanStage =
  | "lead"
  | "qualified"
  | "contacted"
  | "meeting_scheduled"
  | "needs_analysis"
  | "property_match"
  | "offer_preparation"
  | "offer_sent"
  | "negotiation"
  | "contract_preparation"
  | "closed_won"
  | "closed_lost";

const PIPELINE_ORDER: KanbanStage[] = [
  "lead",
  "qualified",
  "contacted",
  "meeting_scheduled",
  "needs_analysis",
  "property_match",
  "offer_preparation",
  "offer_sent",
  "negotiation",
  "contract_preparation",
  "closed_won",
  "closed_lost",
];

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isKanbanStage(v: string | null): v is KanbanStage {
  return !!v && PIPELINE_ORDER.includes(v as KanbanStage);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const scope = optString(req.query.scope) === "agent" ? "agent" : "office";
    const caseType = optString(req.query.caseType);
    const assignedUserId = optString(req.query.assignedUserId);

    const params: any[] = [officeId];
    let idx = 2;

    const where: string[] = [`c.office_id = $1::uuid`];

    if (scope === "agent") {
      where.push(`COALESCE(pc.case_assigned_user_id, c.assigned_user_id)::uuid = $${idx}::uuid`);
      params.push(userId);
      idx++;
    }

    if (assignedUserId) {
      where.push(`COALESCE(pc.case_assigned_user_id, c.assigned_user_id)::uuid = $${idx}::uuid`);
      params.push(assignedUserId);
      idx++;
    }

    if (caseType) {
      where.push(`COALESCE(pc.case_type::text, '') = $${idx}`);
      params.push(caseType);
      idx++;
    }

    const sql = `
      WITH primary_cases AS (
        SELECT
          cc.id,
          cc.office_id,
          cc.party_id,
          cc.case_type,
          cc.status AS case_status,
          cc.assigned_user_id AS case_assigned_user_id,
          cc.created_at AS case_created_at,
          cc.updated_at AS case_updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY cc.party_id
            ORDER BY
              CASE WHEN cc.status = 'active' THEN 0 ELSE 1 END,
              cc.created_at ASC
          ) AS rn
        FROM public.client_cases cc
        WHERE cc.office_id = $1::uuid
      ),
      listing_rollup AS (
        SELECT
          lp.party_id,
          COUNT(DISTINCT l.id)::int AS listing_count,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT l.id::text), NULL) AS listing_ids,
          ARRAY_REMOVE(
            ARRAY_AGG(
              DISTINCT CASE
                WHEN COALESCE(l.title, '') <> '' THEN l.title
                ELSE CONCAT(
                  COALESCE(l.record_type::text, ''),
                  CASE WHEN l.transaction_type IS NOT NULL THEN ' / ' || l.transaction_type::text ELSE '' END
                )
              END
            ),
            NULL
          ) AS listing_titles,
          (
            ARRAY_AGG(
              l.id::text
              ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST, l.id DESC
            )
          )[1] AS latest_listing_id
        FROM public.listing_parties lp
        JOIN public.listings l
          ON l.id = lp.listing_id
         AND l.office_id = $1::uuid
        GROUP BY lp.party_id
      )
      SELECT
        c.id::text AS party_id,
        c.full_name,
        c.party_type,
        c.phone,
        c.email,
        c.status,
        c.pipeline_stage,
        c.assigned_user_id::text AS contact_assigned_user_id,

        pc.id::text AS client_case_id,
        pc.case_type::text AS case_type,
        pc.case_status::text AS case_status,
        pc.case_assigned_user_id::text AS case_assigned_user_id,
        pc.case_created_at,
        pc.case_updated_at,

        m.full_name AS assigned_user_name,

        COALESCE(lr.listing_count, 0) AS listing_count,
        COALESCE(lr.listing_ids, ARRAY[]::text[]) AS listing_ids,
        COALESCE(lr.listing_titles, ARRAY[]::text[]) AS listing_titles,
        lr.latest_listing_id,

        c.created_at,
        c.updated_at

      FROM public.crm_contacts_view c
      LEFT JOIN primary_cases pc
        ON pc.party_id = c.id
       AND pc.office_id = c.office_id
       AND pc.rn = 1
      LEFT JOIN public.memberships m
        ON m.office_id = c.office_id
       AND m.user_id = COALESCE(pc.case_assigned_user_id, c.assigned_user_id)
      LEFT JOIN listing_rollup lr
        ON lr.party_id = c.id
      WHERE ${where.join(" AND ")}
      ORDER BY
        array_position(
          ARRAY[
            'lead',
            'qualified',
            'contacted',
            'meeting_scheduled',
            'needs_analysis',
            'property_match',
            'offer_preparation',
            'offer_sent',
            'negotiation',
            'contract_preparation',
            'closed_won',
            'closed_lost'
          ]::text[],
          c.pipeline_stage::text
        ) ASC NULLS LAST,
        COALESCE(pc.case_updated_at, c.updated_at) DESC NULLS LAST,
        COALESCE(pc.case_created_at, c.created_at) DESC NULLS LAST,
        c.full_name ASC
    `;

    const { rows } = await pool.query(sql, params);

    const columns = PIPELINE_ORDER.map((stage) => ({
      id: stage,
      title: stage,
      items: [] as any[],
    }));

    const byStage = new Map<KanbanStage, any[]>();
    for (const stage of PIPELINE_ORDER) byStage.set(stage, []);

    for (const row of rows) {
      const stage = isKanbanStage(row.pipeline_stage) ? row.pipeline_stage : "lead";

      byStage.get(stage)!.push({
        client_case_id: row.client_case_id ?? null,
        party_id: row.party_id,
        full_name: row.full_name,
        party_type: row.party_type,
        phone: row.phone,
        email: row.email,
        case_type: row.case_type,
        case_status: row.case_status,
        pipeline_stage: stage,
        assigned_user_id: row.case_assigned_user_id ?? row.contact_assigned_user_id ?? null,
        assigned_user_name: row.assigned_user_name,
        listing_count: Number(row.listing_count ?? 0),
        listing_ids: Array.isArray(row.listing_ids) ? row.listing_ids : [],
        listing_titles: Array.isArray(row.listing_titles) ? row.listing_titles : [],
        latest_listing_id: row.latest_listing_id ?? null,
        created_at: row.case_created_at ?? row.created_at,
        updated_at: row.case_updated_at ?? row.updated_at,
      });
    }

    for (const col of columns) {
      col.items = byStage.get(col.id as KanbanStage) ?? [];
    }

    return res.status(200).json({
      ok: true,
      officeId,
      scope,
      columns,
      stages: PIPELINE_ORDER,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("KANBAN_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}