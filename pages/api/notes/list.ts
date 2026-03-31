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

function isNoteSource(v: string | null): v is NoteSource {
  return (
    v === "client" ||
    v === "listing" ||
    v === "event" ||
    v === "external_listing"
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const source = optString(req.query.source);
    const clientId = optString(req.query.clientId);
    const listingId = optString(req.query.listingId);
    const eventId = optString(req.query.eventId);
    const externalListingId = optString(req.query.externalListingId);
    const q = optString(req.query.q);
    const limit = Math.min(optInt(req.query.limit, 100), 300);

    const params: any[] = [officeId];
    let idx = 2;
    const where: string[] = [];

    if (isNoteSource(source)) {
      where.push(`x.note_source = $${idx}`);
      params.push(source);
      idx++;
    }

    if (clientId) {
      where.push(`x.client_id = $${idx}::uuid`);
      params.push(clientId);
      idx++;
    }

    if (listingId) {
      where.push(`x.listing_id = $${idx}::uuid`);
      params.push(listingId);
      idx++;
    }

    if (eventId) {
      where.push(`x.event_id = $${idx}::uuid`);
      params.push(eventId);
      idx++;
    }

    if (externalListingId) {
      where.push(`x.external_listing_id = $${idx}::uuid`);
      params.push(externalListingId);
      idx++;
    }

    if (q) {
      where.push(`
        (
          x.note ILIKE '%' || $${idx} || '%'
          OR coalesce(x.subject_title, '') ILIKE '%' || $${idx} || '%'
          OR coalesce(x.author_name, '') ILIKE '%' || $${idx} || '%'
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      WITH unified AS (
        SELECT
          cn.id::text,
          'client'::text AS note_source,
          cn.office_id::text,
          cn.user_id::text,
          cn.note,
          cn.created_at,
          cn.updated_at,
          cn.client_id::text AS client_id,
          NULL::text AS listing_id,
          NULL::text AS event_id,
          NULL::text AS external_listing_id,
          p.full_name AS subject_title
        FROM public.client_notes cn
        JOIN public.parties p
          ON p.id = cn.client_id
         AND p.office_id = cn.office_id
        WHERE cn.office_id = $1::uuid

        UNION ALL

        SELECT
          ln.id::text,
          'listing'::text AS note_source,
          ln.office_id::text,
          ln.user_id::text,
          ln.note,
          ln.created_at,
          ln.updated_at,
          NULL::text AS client_id,
          ln.listing_id::text AS listing_id,
          NULL::text AS event_id,
          NULL::text AS external_listing_id,
          COALESCE(l.title, CONCAT(l.record_type::text, ' / ', l.transaction_type::text)) AS subject_title
        FROM public.listing_notes ln
        JOIN public.listings l
          ON l.id = ln.listing_id
         AND l.office_id = ln.office_id
        WHERE ln.office_id = $1::uuid

        UNION ALL

        SELECT
          en.id::text,
          'event'::text AS note_source,
          en.office_id::text,
          en.user_id::text,
          en.note,
          en.created_at,
          en.updated_at,
          NULL::text AS client_id,
          NULL::text AS listing_id,
          en.event_id::text AS event_id,
          NULL::text AS external_listing_id,
          e.title AS subject_title
        FROM public.event_notes en
        JOIN public.events e
          ON e.id = en.event_id
         AND e.org_id = en.office_id
        WHERE en.office_id = $1::uuid

        UNION ALL

        SELECT
          exn.id::text,
          'external_listing'::text AS note_source,
          exn.office_id::text,
          exn.user_id::text,
          exn.note,
          exn.created_at,
          exn.updated_at,
          NULL::text AS client_id,
          NULL::text AS listing_id,
          NULL::text AS event_id,
          exn.external_listing_id::text AS external_listing_id,
          COALESCE(el.title, el.source_url, el.id::text) AS subject_title
        FROM public.external_listing_notes exn
        JOIN public.external_listings el
          ON el.id = exn.external_listing_id
        WHERE exn.office_id = $1::uuid
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
        m.full_name AS author_name
      FROM unified x
      LEFT JOIN public.memberships m
        ON m.office_id::text = x.office_id
       AND m.user_id::text = x.user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    return res.status(200).json({
      ok: true,
      rows,
    });
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