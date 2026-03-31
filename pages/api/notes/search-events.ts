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
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const q = optString(req.query.q) ?? "";
    const limit = Math.min(optInt(req.query.limit, 10), 20);

    const params: any[] = [officeId];
    let idx = 2;

    const where: string[] = [
      "c.org_id = $1::uuid",
      "e.id IS NOT NULL",
    ];

    if (q) {
      where.push(`
        (
          e.title ILIKE '%' || $${idx} || '%'
          OR COALESCE(e.description, '') ILIKE '%' || $${idx} || '%'
          OR COALESCE(e.location_text, '') ILIKE '%' || $${idx} || '%'
          OR COALESCE(e.type::text, '') ILIKE '%' || $${idx} || '%'
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      SELECT
        e.id::text AS id,
        e.title,
        e.start_at,
        e.end_at,
        e.location_text,
        e.type::text AS event_type,
        e.source::text AS source,
        cal.id::text AS calendar_id,
        cal.owner_user_id::text AS owner_user_id
      FROM public.events e
      JOIN public.calendars cal
        ON cal.id = e.calendar_id
      JOIN public.calendars c
        ON c.id = cal.id
      WHERE ${where.join(" AND ")}
      ORDER BY e.start_at DESC NULLS LAST, e.created_at DESC NULLS LAST
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    return res.status(200).json({
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title ?? "—",
        start_at: row.start_at ?? null,
        end_at: row.end_at ?? null,
        location_text: row.location_text ?? null,
        event_type: row.event_type ?? null,
        source: row.source ?? null,
        calendar_id: row.calendar_id ?? null,
        owner_user_id: row.owner_user_id ?? null,
      })),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("NOTES_SEARCH_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}