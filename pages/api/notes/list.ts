import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type NoteSource = "client" | "listing" | "event" | "external_listing";

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
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const source = optString(req.query.source) as NoteSource | null;
    const q = optString(req.query.q) ?? "";
    const limit = Math.min(optInt(req.query.limit, 150), 300);

    const params: any[] = [officeId];
    let idx = 2;

    const where: string[] = ["x.office_id = $1::uuid"];

    if (source && ["client", "listing", "event", "external_listing"].includes(source)) {
      where.push(`x.note_source = $${idx}`);
      params.push(source);
      idx++;
    }

    if (q) {
      where.push(`
        (
          x.note ILIKE '%' || $${idx} || '%'
          OR COALESCE(x.subject_title, '') ILIKE '%' || $${idx} || '%'
          OR COALESCE(x.author_name, '') ILIKE '%' || $${idx} || '%'
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      WITH all_notes AS (
        -- CLIENT NOTES
        SELECT
          cn.id::text AS id,
          'client'::text AS note_source,
          cn.office_id AS office_id,
          COALESCE(cn.author_user_id, cn.user_id)::text AS user_id,
          cn.note,
          cn.created_at,
          cn.updated_at,
          cn.party_id::text AS client_id,
          NULL::text AS listing_id,
          NULL::text AS event_id,
          NULL::text AS external_listing_id,
          p.full_name AS subject_title,
          m.full_name AS author_name
        FROM public.client_notes cn
        LEFT JOIN public.parties p
          ON p.id = cn.party_id
         AND p.office_id = cn.office_id
        LEFT JOIN public.memberships m
          ON m.office_id = cn.office_id
         AND m.user_id = COALESCE(cn.author_user_id, cn.user_id)

        UNION ALL

        -- CRM LISTING NOTES
        SELECT
          ln.id::text AS id,
          'listing'::text AS note_source,
          ln.office_id AS office_id,
          ln.user_id::text AS user_id,
          ln.note,
          ln.created_at,
          ln.updated_at,
          NULL::text AS client_id,
          ln.listing_id::text AS listing_id,
          NULL::text AS event_id,
          NULL::text AS external_listing_id,
          COALESCE(
            l.title,
            CONCAT_WS(' / ', l.record_type::text, l.transaction_type::text, l.status::text),
            l.id::text
          ) AS subject_title,
          m.full_name AS author_name
        FROM public.listing_notes ln
        JOIN public.listings l
          ON l.id = ln.listing_id
         AND l.office_id = ln.office_id
        LEFT JOIN public.memberships m
          ON m.office_id = ln.office_id
         AND m.user_id = ln.user_id
        WHERE ln.listing_id IS NOT NULL

        UNION ALL

        -- LEGACY/ALT EXTERNAL NOTES FROM listing_notes.external_listing_id
        SELECT
          ln.id::text AS id,
          'external_listing'::text AS note_source,
          ln.office_id::text AS office_id,
          ln.user_id::text AS user_id,
          ln.note,
          ln.created_at,
          ln.updated_at,
          NULL::text AS client_id,
          NULL::text AS listing_id,
          NULL::text AS event_id,
          ln.external_listing_id::text AS external_listing_id,
          COALESCE(
            el.title,
            el.source_url,
            el.id::text
          ) AS subject_title,
          m.full_name AS author_name
        FROM public.listing_notes ln
        JOIN public.external_listings el
          ON el.id = ln.external_listing_id
        LEFT JOIN public.memberships m
          ON m.office_id = ln.office_id
         AND m.user_id = ln.user_id
        WHERE ln.external_listing_id IS NOT NULL
          AND ln.listing_id IS NULL

        UNION ALL

        -- EXTERNAL LISTING NOTES
        SELECT
          en.id::text AS id,
          'external_listing'::text AS note_source,
          en.office_id AS office_id,
          en.user_id::text AS user_id,
          en.note,
          en.created_at,
          en.updated_at,
          NULL::text AS client_id,
          NULL::text AS listing_id,
          NULL::text AS event_id,
          en.external_listing_id::text AS external_listing_id,
          COALESCE(
            el.title,
            el.source_url,
            el.id::text
          ) AS subject_title,
          m.full_name AS author_name
        FROM public.external_listing_notes en
        JOIN public.external_listings el
          ON el.id = en.external_listing_id
        LEFT JOIN public.memberships m
          ON m.office_id = en.office_id
         AND m.user_id = en.user_id
      )
      SELECT
        x.id,
        x.note_source,
        x.office_id,
        x.user_id,
        x.note,
        x.created_at,
        x.updated_at,
        x.client_id,
        x.listing_id,
        x.event_id,
        x.external_listing_id,
        x.subject_title,
        x.author_name
      FROM all_notes x
      WHERE ${where.join(" AND ")}
      ORDER BY x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
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

    console.error("NOTES_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}