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

function mustNote(v: unknown) {
  const s = optString(v);
  if (!s) throw new Error("MISSING_NOTE");
  return s;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);

    const note = mustNote(req.body?.note);

    const clientId = optString(req.body?.clientId);
    const listingId = optString(req.body?.listingId);
    const eventId = optString(req.body?.eventId);
    const externalListingId = optString(req.body?.externalListingId);

    const targets = [clientId, listingId, eventId, externalListingId].filter(Boolean);

    if (targets.length !== 1) {
      return res.status(400).json({
        error: "EXACTLY_ONE_TARGET_REQUIRED",
      });
    }

    if (clientId) {
      await pool.query(
        `
        INSERT INTO public.client_notes (
          office_id,
          party_id,
          user_id,
          author_user_id,
          note,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $3::uuid,
          $4,
          now(),
          now()
        )
        `,
        [officeId, clientId, userId, note]
      );

      return res.status(200).json({ ok: true, source: "client" });
    }

    if (listingId) {
      await pool.query(
        `
        INSERT INTO public.listing_notes (
          office_id,
          listing_id,
          user_id,
          note,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          now(),
          now()
        )
        `,
        [officeId, listingId, userId, note]
      );

      return res.status(200).json({ ok: true, source: "listing" });
    }

    if (externalListingId) {
      await pool.query(
        `
        INSERT INTO public.external_listing_notes (
          office_id,
          external_listing_id,
          user_id,
          note,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          now(),
          now()
        )
        `,
        [officeId, externalListingId, userId, note]
      );

      return res.status(200).json({ ok: true, source: "external_listing" });
    }

    if (eventId) {
      return res.status(400).json({
        error: "EVENT_NOTES_TABLE_MISSING",
      });
    }

    return res.status(400).json({ error: "INVALID_TARGET" });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    if (e?.message === "MISSING_NOTE") {
      return res.status(400).json({ error: "MISSING_NOTE" });
    }

    console.error("NOTES_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}