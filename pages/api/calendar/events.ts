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
    const calendarId = mustString(req.query.calendarId, "calendarId");

    // calendar meta
    const cal = await pool.query(
      `SELECT id, org_id, owner_user_id FROM calendars WHERE id = $1 LIMIT 1`,
      [calendarId]
    );
    const calRow = cal.rows[0];
    if (!calRow) return res.status(404).json({ error: "Calendar not found" });

    const orgId: string = calRow.org_id;
    const ownerUserId: string | null = calRow.owner_user_id ?? null;
    const isOfficeCalendar = ownerUserId === null;

    if (req.method === "GET") {
      const start = optString(req.query.start);
      const end = optString(req.query.end);

      // Jeśli to kalendarz biura: agreguj eventy wszystkich userów w tym office (org_id = officeId)
      if (isOfficeCalendar) {
        const { rows } = await pool.query(
          `
          SELECT e.id, e.title, e.description, e.location_text, e.start_at, e.end_at, e.status,
                 cu.owner_user_id as owner_user_id
          FROM events e
          JOIN calendars cu ON cu.id = e.calendar_id
          WHERE cu.org_id = $1
            AND cu.owner_user_id IS NOT NULL
            AND ($2::timestamptz IS NULL OR e.end_at   > $2::timestamptz)
            AND ($3::timestamptz IS NULL OR e.start_at < $3::timestamptz)
          ORDER BY e.start_at ASC
          `,
          [orgId, start, end]
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
              ownerUserId: r.owner_user_id ?? null, // przyda się do UI/kolorów
            },
          }))
        );
      }

      // Jeśli to kalendarz użytkownika: tylko jego eventy
      const { rows } = await pool.query(
        `
        SELECT id, title, description, location_text, start_at, end_at, status
        FROM events
        WHERE calendar_id = $1
          AND ($2::timestamptz IS NULL OR end_at   > $2::timestamptz)
          AND ($3::timestamptz IS NULL OR start_at < $3::timestamptz)
        ORDER BY start_at ASC
        `,
        [calendarId, start, end]
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
      const sessionUserId = getUserIdFromRequest(req);
      if (!sessionUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

      const body = req.body ?? {};
      const title = mustString(body.title, "title");
      const start = mustString(body.start, "start");
      const end = mustString(body.end, "end");
      const description = optString(body.description);
      const locationText = optString(body.locationText);

      // MVP: zapis zawsze do kalendarza usera zalogowanego
      const userCal = await pool.query(
        `SELECT id FROM calendars WHERE org_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [orgId, sessionUserId]
      );
      const targetCalendarId: string | null = userCal.rows[0]?.id ?? null;
      if (!targetCalendarId) {
        return res.status(409).json({ error: "User calendar missing for this office" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO events (org_id, calendar_id, title, description, location_text, start_at, end_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
        RETURNING id
        `,
        [orgId, targetCalendarId, title, description, locationText, start, end, sessionUserId]
      );

      return res.status(201).json({ id: rows[0].id });
    }

    res.setHeader("Allow", "GET,POST");
    if (req.method === "PATCH") {
  const sessionUserId = getUserIdFromRequest(req);
  if (!sessionUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const body = req.body ?? {};
  const eventId = mustString(body.id, "id");

  const title = optString(body.title);
  const start = optString(body.start);
  const end = optString(body.end);
  const description = optString(body.description);
  const locationText = optString(body.locationText);

  // 1. Pobierz event + właściciela
  const ev = await pool.query(
    `
    SELECT e.id, e.created_by, c.owner_user_id
    FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    WHERE e.id = $1
    LIMIT 1
    `,
    [eventId]
  );

  const row = ev.rows[0];
  if (!row) return res.status(404).json({ error: "Event not found" });

  const isOwner = row.created_by === sessionUserId;
  const isOfficeEvent = row.owner_user_id === null;

  // 2. TODO: tu w przyszłości sprawdzisz permissions z memberships
  if (!isOwner && !isOfficeEvent) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  // 3. Update
  await pool.query(
    `
    UPDATE events
    SET
      title = COALESCE($2, title),
      description = COALESCE($3, description),
      location_text = COALESCE($4, location_text),
      start_at = COALESCE($5::timestamptz, start_at),
      end_at   = COALESCE($6::timestamptz, end_at)
    WHERE id = $1
    `,
    [eventId, title, description, locationText, start, end]
  );

  return res.status(200).json({ ok: true });
}

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("CAL_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
