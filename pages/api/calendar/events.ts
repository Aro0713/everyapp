import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}
function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const orgId = mustString(req.query.orgId, "orgId");
    const calendarId = mustString(req.query.calendarId, "calendarId");

    if (req.method === "GET") {
      const start = optString(req.query.start);
      const end = optString(req.query.end);

      const { rows } = await pool.query(
        `
        SELECT id, title, description, location_text, start_at, end_at, status
        FROM events
        WHERE org_id = $1
          AND calendar_id = $2
          AND ($3::timestamptz IS NULL OR end_at   > $3::timestamptz)
          AND ($4::timestamptz IS NULL OR start_at < $4::timestamptz)
        ORDER BY start_at ASC
        `,
        [orgId, calendarId, start, end]
      );

      return res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          start: r.start_at,
          end: r.end_at,
          extendedProps: {
            description: r.description ?? null,
            locationText: r.location_text ?? null,
            status: r.status ?? null,
          },
        }))
      );
    }

    if (req.method === "POST") {
      // ✅ bierz usera z SESJI
      const sessionUserId = getUserIdFromRequest(req);

      if (!sessionUserId) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
      }

      const body = req.body ?? {};
      const title = mustString(body.title, "title");
      const start = mustString(body.start, "start");
      const end = mustString(body.end, "end");
      const description = optString(body.description);
      const locationText = optString(body.locationText);

      const { rows } = await pool.query(
        `
        INSERT INTO events (org_id, calendar_id, title, description, location_text, start_at, end_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
        RETURNING id
        `,
        [orgId, calendarId, title, description, locationText, start, end, sessionUserId]
      );

      return res.status(201).json({ id: rows[0].id });
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("CAL_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
