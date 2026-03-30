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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const partyId = mustString(req.body?.partyId, "partyId");
    const nextStage = parseStage(req.body?.pipelineStage);

    const existing = await pool.query<{
      id: string;
      office_id: string;
      pipeline_stage: string | null;
    }>(
      `
      SELECT
        p.id::text,
        p.office_id::text,
        p.pipeline_stage::text
      FROM public.parties p
      WHERE p.id = $1::uuid
        AND p.office_id = $2::uuid
      LIMIT 1
      `,
      [partyId, officeId]
    );

    const row = existing.rows[0];
    if (!row) {
      return res.status(404).json({ error: "PARTY_NOT_FOUND" });
    }

    await pool.query(
      `
      UPDATE public.parties
      SET
        pipeline_stage = $2::public.party_pipeline_stage_type,
        updated_at = now()
      WHERE id = $1::uuid
        AND office_id = $3::uuid
      `,
      [partyId, nextStage, officeId]
    );

    return res.status(200).json({
      ok: true,
      partyId,
      previousStage: row.pipeline_stage,
      pipelineStage: nextStage,
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