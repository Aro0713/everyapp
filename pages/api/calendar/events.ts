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

type CalendarEventType =
  | "presentation"
  | "acquisition"
  | "broker_agreement"
  | "preliminary_agreement"
  | "final_agreement"
  | "contact"
  | "task"
  | "vacation"
  | "other"
  | "call"
  | "visit"
  | "meeting"
  | "follow_up";

type EventSource = "manual" | "offers_view" | "calendar_ui" | "ai_agent" | "workflow";

type EventOutcome =
  | "none"
  | "answered"
  | "no_answer"
  | "rescheduled"
  | "completed"
  | "cancelled"
  | "offer_rejected"
  | "interested";

function parseEventType(v: unknown): CalendarEventType | null {
  const allowed: CalendarEventType[] = [
    "presentation",
    "acquisition",
    "broker_agreement",
    "preliminary_agreement",
    "final_agreement",
    "contact",
    "task",
    "vacation",
    "other",
    "call",
    "visit",
    "meeting",
    "follow_up",
  ];

  return typeof v === "string" && allowed.includes(v as CalendarEventType)
    ? (v as CalendarEventType)
    : null;
}

function parseEventSource(v: unknown): EventSource {
  const allowed: EventSource[] = ["manual", "offers_view", "calendar_ui", "ai_agent", "workflow"];
  return typeof v === "string" && allowed.includes(v as EventSource)
    ? (v as EventSource)
    : "manual";
}

function parseEventOutcome(v: unknown): EventOutcome {
  const allowed: EventOutcome[] = [
    "none",
    "answered",
    "no_answer",
    "rescheduled",
    "completed",
    "cancelled",
    "offer_rejected",
    "interested",
  ];

  return typeof v === "string" && allowed.includes(v as EventOutcome)
    ? (v as EventOutcome)
    : "none";
}

function optUuidString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const calendarId = mustString(req.query.calendarId, "calendarId");

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

      if (isOfficeCalendar) {
        const { rows: officeRows } = await pool.query(
          `
          SELECT
            e.id,
            e.title,
            e.description,
            e.location_text,
            e.start_at,
            e.end_at,
            e.status,
            e.type,
            e.source,
            e.outcome,
            e.external_listing_id,
            e.meta,
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
          officeRows.map((r) => ({
            id: r.id,
            title: r.title,
            start: r.start_at,
            end: r.end_at,
            extendedProps: {
              description: r.description ?? null,
              locationText: r.location_text ?? null,
              status: r.status ?? null,
              eventType: r.type ?? null,
              source: r.source ?? null,
              outcome: r.outcome ?? null,
              externalListingId: r.external_listing_id ?? null,
              meta: r.meta ?? {},
              ownerUserId: r.owner_user_id ?? null,
            },
          }))
        );
      }

      const { rows } = await pool.query(
        `
        SELECT
          id,
          title,
          description,
          location_text,
          start_at,
          end_at,
          status,
          type,
          source,
          outcome,
          external_listing_id,
          meta
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
            eventType: r.type ?? null,
            source: r.source ?? null,
            outcome: r.outcome ?? null,
            externalListingId: r.external_listing_id ?? null,
            meta: r.meta ?? {},
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

      const eventType = parseEventType(body.eventType);
      const source = parseEventSource(body.source ?? "calendar_ui");
      const outcome = parseEventOutcome(body.outcome ?? "none");
      const externalListingId = optUuidString(body.externalListingId);
      const meta = safeJson(body.meta);

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
        INSERT INTO events (
          org_id,
          calendar_id,
          title,
          description,
          location_text,
          start_at,
          end_at,
          created_by,
          type,
          source,
          outcome,
          external_listing_id,
          meta
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz,
          $7::timestamptz,
          $8,
          $9,
          $10,
          $11,
          $12::uuid,
          $13::jsonb
        )
        RETURNING id
        `,
        [
          orgId,
          targetCalendarId,
          title,
          description,
          locationText,
          start,
          end,
          sessionUserId,
          eventType,
          source,
          outcome,
          externalListingId,
          JSON.stringify(meta),
        ]
      );

      return res.status(201).json({ id: rows[0].id });
    }

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

      if (!isOwner && !isOfficeEvent) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

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

    res.setHeader("Allow", "GET,POST,PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("CAL_EVENTS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}