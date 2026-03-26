import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

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

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return v.trim();
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(x)) return true;
    if (["false", "0", "no", "n", "off"].includes(x)) return false;
  }
  return fallback;
}

function parseEventType(v: unknown): CalendarEventType {
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

  if (typeof v === "string" && allowed.includes(v as CalendarEventType)) {
    return v as CalendarEventType;
  }

  return "other";
}

function parseEventSource(v: unknown): EventSource {
  const allowed: EventSource[] = ["manual", "offers_view", "calendar_ui", "ai_agent", "workflow"];
  return typeof v === "string" && allowed.includes(v as EventSource)
    ? (v as EventSource)
    : "workflow";
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

function toDateOrThrow(value: string, name: string) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`INVALID_${name.toUpperCase()}`);
  return new Date(ms);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function buildDefaultTitle(eventType: CalendarEventType, listingTitle: string | null) {
  const labelMap: Record<CalendarEventType, string> = {
    presentation: "Prezentacja",
    acquisition: "Spotkanie pozyskowe",
    broker_agreement: "Umowa pośrednictwa",
    preliminary_agreement: "Umowa przedwstępna",
    final_agreement: "Umowa końcowa",
    contact: "Kontakt",
    task: "Zadanie",
    vacation: "Urlop",
    other: "Inne wydarzenie",
    call: "Telefon",
    visit: "Wizyta",
    meeting: "Spotkanie",
    follow_up: "Follow-up",
  };

  return listingTitle ? `${labelMap[eventType]} — ${listingTitle}` : labelMap[eventType];
}

async function getConflicts(
  client: any,
  args: {
    calendarId: string;
    startIso: string;
    endIso: string;
    excludeEventId?: string | null;
  }
) {
  const rows = await client.query(
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
      e.listing_id,
      e.client_id
    FROM public.events e
    WHERE e.calendar_id = $1
      AND e.status <> 'cancelled'
      AND e.start_at < $3::timestamptz
      AND e.end_at > $2::timestamptz
      AND ($4::uuid IS NULL OR e.id <> $4::uuid)
    ORDER BY e.start_at ASC
    `,
    [args.calendarId, args.startIso, args.endIso, args.excludeEventId ?? null]
  );

  return rows.rows;
}

async function findSuggestedSlots(
  client: any,
  args: {
    calendarId: string;
    start: Date;
    end: Date;
    excludeEventId?: string | null;
    stepMinutes?: number;
    suggestionsCount?: number;
    searchDays?: number;
  }
) {
  const stepMinutes = args.stepMinutes ?? 30;
  const suggestionsCount = args.suggestionsCount ?? 5;
  const searchDays = args.searchDays ?? 14;
  const wantedDuration = durationMinutes(args.start, args.end);

  const suggestions: Array<{ start: string; end: string }> = [];

  let cursor = new Date(args.start.getTime());

  const limit = addMinutes(new Date(args.start.getTime() + searchDays * 24 * 60 * 60_000), 0);

  while (cursor < limit && suggestions.length < suggestionsCount) {
    const candidateStart = new Date(cursor.getTime());
    const candidateEnd = addMinutes(candidateStart, wantedDuration);

    const conflicts = await getConflicts(client, {
      calendarId: args.calendarId,
      startIso: candidateStart.toISOString(),
      endIso: candidateEnd.toISOString(),
      excludeEventId: args.excludeEventId ?? null,
    });

    if (conflicts.length === 0) {
      suggestions.push({
        start: candidateStart.toISOString(),
        end: candidateEnd.toISOString(),
      });
    }

    cursor = addMinutes(cursor, stepMinutes);
  }

  return suggestions;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const sessionUserId = mustUserId(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(sessionUserId);

    const listingId = mustString(req.body?.listingId, "listingId");
    const eventType = parseEventType(req.body?.eventType);
    const source = parseEventSource(req.body?.source);
    const outcome = parseEventOutcome(req.body?.outcome);

    const startRaw = mustString(req.body?.start, "start");
    const endRaw = mustString(req.body?.end, "end");

    const startAt = toDateOrThrow(startRaw, "start");
    const endAt = toDateOrThrow(endRaw, "end");

    if (endAt <= startAt) {
      return res.status(400).json({ error: "INVALID_TIME_RANGE" });
    }

    const checkOnly = optBool(req.body?.checkOnly, false);
    const overwriteExistingEventId = optString(req.body?.overwriteExistingEventId);

    const listingRes = await client.query(
      `
      SELECT
        l.id,
        l.office_id,
        l.title,
        l.location_text,
        l.description,
        l.offer_number
      FROM public.listings l
      WHERE l.id = $1
        AND l.office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    const listing = listingRes.rows[0];
    if (!listing) {
      return res.status(404).json({ error: "LISTING_NOT_FOUND" });
    }

    const calendarRes = await client.query(
      `
      SELECT id, org_id, owner_user_id, name, timezone
      FROM public.calendars
      WHERE owner_user_id = $1
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
      `,
      [sessionUserId]
    );

    const calendar = calendarRes.rows[0];
    if (!calendar) {
      return res.status(409).json({ error: "USER_CALENDAR_NOT_FOUND" });
    }

    const clientPartyRes = await client.query(
      `
      SELECT
        p.id,
        p.full_name
      FROM public.listing_parties lp
      JOIN public.parties p
        ON p.id = lp.party_id
      WHERE lp.listing_id = $1
      ORDER BY lp.is_primary DESC, lp.created_at ASC
      LIMIT 1
      `,
      [listingId]
    );

    const mainParty = clientPartyRes.rows[0] ?? null;

    const title =
      optString(req.body?.title) ?? buildDefaultTitle(eventType, listing.title ?? null);

    const description =
      optString(req.body?.description) ??
      listing.description ??
      null;

    const locationText =
      optString(req.body?.locationText) ??
      listing.location_text ??
      null;

    const note = optString(req.body?.note);
    const meta = {
      listingId,
      offerNumber: listing.offer_number ?? null,
      listingTitle: listing.title ?? null,
      eventType,
      note,
      createdFrom: "offer_workspace",
    };

    const conflicts = await getConflicts(client, {
      calendarId: calendar.id,
      startIso: startAt.toISOString(),
      endIso: endAt.toISOString(),
      excludeEventId: overwriteExistingEventId,
    });

    if (conflicts.length > 0 && !overwriteExistingEventId) {
      const suggestions = await findSuggestedSlots(client, {
        calendarId: calendar.id,
        start: startAt,
        end: endAt,
        excludeEventId: null,
      });

      return res.status(409).json({
        ok: false,
        conflict: true,
        conflicts,
        suggestions,
      });
    }

    if (checkOnly) {
      const suggestions =
        conflicts.length > 0
          ? await findSuggestedSlots(client, {
              calendarId: calendar.id,
              start: startAt,
              end: endAt,
              excludeEventId: overwriteExistingEventId,
            })
          : [];

      return res.status(200).json({
        ok: true,
        conflict: conflicts.length > 0,
        conflicts,
        suggestions,
      });
    }

    await client.query("BEGIN");

    let eventId: string;

    if (overwriteExistingEventId) {
      const existingRes = await client.query(
        `
        SELECT
          e.id,
          e.calendar_id
        FROM public.events e
        WHERE e.id = $1
          AND e.calendar_id = $2
        LIMIT 1
        `,
        [overwriteExistingEventId, calendar.id]
      );

      const existing = existingRes.rows[0];
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "EVENT_TO_OVERWRITE_NOT_FOUND" });
      }

      const updateRes = await client.query(
        `
        UPDATE public.events
        SET
          title = $2,
          description = $3,
          location_text = $4,
          start_at = $5::timestamptz,
          end_at = $6::timestamptz,
          updated_by = $7,
          type = $8,
          source = $9,
          outcome = $10,
          listing_id = $11,
          client_id = $12,
          meta = $13::jsonb,
          updated_at = now()
        WHERE id = $1
        RETURNING id
        `,
        [
          overwriteExistingEventId,
          title,
          description,
          locationText,
          startAt.toISOString(),
          endAt.toISOString(),
          sessionUserId,
          eventType,
          source,
          outcome,
          listingId,
          mainParty?.id ?? null,
          JSON.stringify(meta),
        ]
      );

      eventId = updateRes.rows[0].id as string;

      await client.query(
        `
        INSERT INTO public.listing_history (
          office_id,
          listing_id,
          event_type,
          event_label,
          old_value,
          new_value,
          note,
          created_by_user_id
        )
        VALUES ($1, $2, 'event_rescheduled', 'Zmiana terminu wydarzenia', NULL, $3, $4, $5)
        `,
        [
          officeId,
          listingId,
          `${title} | ${startAt.toISOString()} - ${endAt.toISOString()}`,
          note,
          sessionUserId,
        ]
      );
    } else {
      const insertRes = await client.query(
        `
        INSERT INTO public.events (
          org_id,
          calendar_id,
          listing_id,
          client_id,
          title,
          description,
          location_text,
          start_at,
          end_at,
          status,
          created_by,
          type,
          source,
          outcome,
          meta
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $9::timestamptz,
          'scheduled',
          $10,
          $11,
          $12,
          $13,
          $14::jsonb
        )
        RETURNING id
        `,
        [
          calendar.org_id,
          calendar.id,
          listingId,
          mainParty?.id ?? null,
          title,
          description,
          locationText,
          startAt.toISOString(),
          endAt.toISOString(),
          sessionUserId,
          eventType,
          source,
          outcome,
          JSON.stringify(meta),
        ]
      );

      eventId = insertRes.rows[0].id as string;

      await client.query(
        `
        INSERT INTO public.listing_history (
          office_id,
          listing_id,
          event_type,
          event_label,
          old_value,
          new_value,
          note,
          created_by_user_id
        )
        VALUES ($1, $2, 'event_created', 'Utworzenie wydarzenia', NULL, $3, $4, $5)
        `,
        [
          officeId,
          listingId,
          `${title} | ${startAt.toISOString()} - ${endAt.toISOString()}`,
          note,
          sessionUserId,
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      conflict: false,
      eventId,
      calendarId: calendar.id,
      orgId: calendar.org_id,
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_SCHEDULE_EVENT_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}