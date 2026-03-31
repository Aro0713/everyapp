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

const ALLOWED_STAGES = new Set<KanbanStage>([
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
]);

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function mustString(v: unknown, name: string) {
  const s = optString(v);
  if (!s) throw new Error(`MISSING_${name.toUpperCase()}`);
  return s;
}

function parseStage(v: unknown): KanbanStage {
  const s = optString(v);
  if (!s || !ALLOWED_STAGES.has(s as KanbanStage)) {
    throw new Error("INVALID_PIPELINE_STAGE");
  }
  return s as KanbanStage;
}

async function resolveClientCase(params: {
  officeId: string;
  clientCaseId?: string | null;
  partyId?: string | null;
}) {
  const { officeId, clientCaseId, partyId } = params;

  if (clientCaseId) {
    const byCaseId = await pool.query<{
      client_case_id: string;
      office_id: string;
      party_id: string;
      pipeline_stage: string | null;
      full_name: string | null;
    }>(
      `
      SELECT
        cc.id::text AS client_case_id,
        cc.office_id::text AS office_id,
        cc.party_id::text AS party_id,
        cc.pipeline_stage::text AS pipeline_stage,
        p.full_name
      FROM public.client_cases cc
      JOIN public.parties p
        ON p.id = cc.party_id
       AND p.office_id = cc.office_id
      WHERE cc.id = $1::uuid
        AND cc.office_id = $2::uuid
      LIMIT 1
      `,
      [clientCaseId, officeId]
    );

    return byCaseId.rows[0] ?? null;
  }

  if (partyId) {
    const byPartyId = await pool.query<{
      client_case_id: string;
      office_id: string;
      party_id: string;
      pipeline_stage: string | null;
      full_name: string | null;
    }>(
      `
      SELECT
        cc.id::text AS client_case_id,
        cc.office_id::text AS office_id,
        cc.party_id::text AS party_id,
        cc.pipeline_stage::text AS pipeline_stage,
        p.full_name
      FROM public.client_cases cc
      JOIN public.parties p
        ON p.id = cc.party_id
       AND p.office_id = cc.office_id
      WHERE cc.party_id = $1::uuid
        AND cc.office_id = $2::uuid
      ORDER BY
        CASE WHEN cc.status = 'active' THEN 0 ELSE 1 END,
        cc.created_at ASC,
        cc.id ASC
      LIMIT 1
      `,
      [partyId, officeId]
    );

    return byPartyId.rows[0] ?? null;
  }

  throw new Error("MISSING_CLIENT_CASE_ID_OR_PARTY_ID");
}

async function findCalendarId(officeId: string, userId: string) {
  const calRes = await pool.query<{ id: string }>(
    `
    SELECT id::text
    FROM public.calendars
    WHERE org_id = $1::uuid
      AND owner_user_id = $2::uuid
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
    `,
    [officeId, userId]
  );

  return calRes.rows[0]?.id ?? null;
}

async function ensureWorkflowEvent(params: {
  officeId: string;
  calendarId: string;
  userId: string;
  partyId: string;
  clientCaseId: string;
  title: string;
  type: "call" | "meeting";
  durationMinutes: number;
}) {
  const {
    officeId,
    calendarId,
    userId,
    partyId,
    clientCaseId,
    title,
    type,
    durationMinutes,
  } = params;

  const duplicateCheck = await pool.query<{ id: string }>(
    `
    SELECT e.id::text
    FROM public.events e
    WHERE e.org_id = $1::uuid
      AND e.calendar_id = $2::uuid
      AND e.client_id = $3::uuid
      AND e.type = $4::public.event_type
      AND e.source = 'workflow'::public.event_source
      AND e.start_at >= now() - interval '10 minutes'
    ORDER BY e.created_at DESC
    LIMIT 1
    `,
    [officeId, calendarId, partyId, type]
  );

  if (duplicateCheck.rows[0]) {
    return duplicateCheck.rows[0].id;
  }

  const insertRes = await pool.query<{ id: string }>(
    `
    INSERT INTO public.events (
      org_id,
      calendar_id,
      title,
      start_at,
      end_at,
      created_by,
      updated_by,
      type,
      source,
      client_id,
      meta
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3,
      now(),
      now() + ($4::text || ' minutes')::interval,
      $5::uuid,
      $5::uuid,
      $6::public.event_type,
      'workflow'::public.event_source,
      $7::uuid,
      jsonb_build_object(
        'workflow', true,
        'clientCaseId', $8::uuid
      )
    )
    RETURNING id::text
    `,
    [officeId, calendarId, title, String(durationMinutes), userId, type, partyId, clientCaseId]
  );

  return insertRes.rows[0]?.id ?? null;
}

async function ensureOfferDraft(params: {
  req: NextApiRequest;
  officeId: string;
  partyId: string;
}) {
  const { req, officeId, partyId } = params;

  const listingCheck = await pool.query<{ listing_id: string }>(
    `
    SELECT lp.listing_id::text
    FROM public.listing_parties lp
    JOIN public.listings l
      ON l.id = lp.listing_id
    WHERE lp.party_id = $1::uuid
      AND l.office_id = $2::uuid
      AND l.status IN ('draft', 'active')
    LIMIT 1
    `,
    [partyId, officeId]
  );

  if (listingCheck.rows[0]?.listing_id) {
    return listingCheck.rows[0].listing_id;
  }

  const proto =
    optString(req.headers["x-forwarded-proto"]) ||
    (req.headers.host?.includes("localhost") ? "http" : "https");

  const host =
    optString(req.headers["x-forwarded-host"]) ||
    optString(req.headers.host);

  if (!host) {
    throw new Error("MISSING_REQUEST_HOST");
  }

  const offerRes = await fetch(`${proto}://${host}/api/offers/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.cookie || "",
    },
    body: JSON.stringify({
      recordType: "offer",
      transactionType: "sale",
      status: "draft",
      clientId: partyId,
    }),
  });

  const offerJson = await offerRes.json().catch(() => null);

  if (!offerRes.ok) {
    throw new Error(offerJson?.error ?? `OFFERS_CREATE_HTTP_${offerRes.status}`);
  }

  return offerJson?.listingId ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const nextStage = parseStage(req.body?.pipelineStage);
    const clientCaseId = optString(req.body?.clientCaseId);
    const partyId = optString(req.body?.partyId);

    const existing = await resolveClientCase({
      officeId,
      clientCaseId,
      partyId,
    });

    if (!existing) {
      return res.status(404).json({ error: "CLIENT_CASE_NOT_FOUND" });
    }

    const resolvedClientCaseId = existing.client_case_id;
    const resolvedPartyId = existing.party_id;
    const previousStage = existing.pipeline_stage;
    const partyName = existing.full_name?.trim() || "Klient";

    await pool.query(
      `
      UPDATE public.client_cases
      SET
        pipeline_stage = $2::public.party_pipeline_stage_type,
        updated_at = now()
      WHERE id = $1::uuid
        AND office_id = $3::uuid
      `,
      [resolvedClientCaseId, nextStage, officeId]
    );

    let workflowEventId: string | null = null;
    let createdListingId: string | null = null;

    const calendarId = await findCalendarId(officeId, userId);

    if (nextStage === "contacted" && calendarId) {
      workflowEventId = await ensureWorkflowEvent({
        officeId,
        calendarId,
        userId,
        partyId: resolvedPartyId,
        clientCaseId: resolvedClientCaseId,
        title: `Telefon: ${partyName}`,
        type: "call",
        durationMinutes: 5,
      });
    }

    if (nextStage === "meeting_scheduled" && calendarId) {
      workflowEventId = await ensureWorkflowEvent({
        officeId,
        calendarId,
        userId,
        partyId: resolvedPartyId,
        clientCaseId: resolvedClientCaseId,
        title: `Spotkanie: ${partyName}`,
        type: "meeting",
        durationMinutes: 30,
      });
    }

    if (nextStage === "offer_preparation") {
      createdListingId = await ensureOfferDraft({
        req,
        officeId,
        partyId: resolvedPartyId,
      });
    }

    return res.status(200).json({
      ok: true,
      clientCaseId: resolvedClientCaseId,
      partyId: resolvedPartyId,
      previousStage,
      pipelineStage: nextStage,
      workflowEventId,
      listingId: createdListingId,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("KANBAN_MOVE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}