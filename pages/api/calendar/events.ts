import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";


function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // MVP: org/calendar passed via query.
    // In production you’ll take these from session (user/org membership).
    const orgId = mustString(req.query.orgId, "orgId");
    const calendarId = mustString(req.query.calendarId, "calendarId");

    if (req.method === "GET") {
      const start = typeof req.query.start === "string" ? req.query.start : null;
      const end = typeof req.query.end === "string" ? req.query.end : null;

      const { rows } = await pool.query(
        `
        SELECT id, title, description, location_text, start_at, end_at, status
        FROM events
        WHERE org_id = $1
          AND calendar_id = $2
          AND ($3::timestamptz IS NULL OR start_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR end_at <= $4::timestamptz)
        ORDER BY start_at ASC
        `,
        [orgId, calendarId, start, end]
      );

      // FullCalendar expects: { id, title, start, end, ... }
      return res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          start: r.start_at,
          end: r.end_at,
          extendedProps: {
            description: r.description,
            locationText: r.location_text,
            status: r.status,
          },
        }))
      );
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const title = mustString(body.title, "title");
      const start = mustString(body.start, "start");
      const end = mustString(body.end, "end");

      // MVP: created_by = owner_user_id later from auth. For now pass it.
      const createdBy = mustString(body.createdBy, "createdBy");

      const description = typeof body.description === "string" ? body.description : null;
      const locationText = typeof body.locationText === "string" ? body.locationText : null;

      const { rows } = await pool.query(
        `
        INSERT INTO events (org_id, calendar_id, title, description, location_text, start_at, end_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
        RETURNING id
        `,
        [orgId, calendarId, title, description, locationText, start, end, createdBy]
      );

      return res.status(201).json({ id: rows[0].id });
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
