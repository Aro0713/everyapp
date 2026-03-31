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

function mustString(v: unknown, name: string) {
  const s = optString(v);
  if (!s) throw new Error(`MISSING_${name.toUpperCase()}`);
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

    const note = mustString(req.body?.note, "note");
    const clientId = optString(req.body?.clientId);
    const listingId = optString(req.body?.listingId);
    const eventId = optString(req.body?.eventId);
    const externalListingId = optString(req.body?.externalListingId);

    const targets = [clientId, listingId, eventId, externalListingId].filter(Boolean);
    if (targets.length !== 1) {
      throw new Error("EXACTLY_ONE_TARGET_REQUIRED");
    }

    if (clientId) {
      const exists = await pool.query(
        `
        SELECT id
        FROM public.parties
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        LIMIT 1
        `,
        [clientId, officeId]
      );

      if (!exists.rows[0]) {
        return res.status(404).json({ error: "CLIENT_NOT_FOUND" });
      }

      const result = await pool.query(
        `
        INSERT INTO public.client_notes (
          office_id,
          client_id,
          user_id,
          note
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        RETURNING id::text, created_at, updated_at
        `,
        [officeId, clientId, userId, note]
      );

      return res.status(201).json({
        ok: true,
        noteSource: "client",
        ...result.rows[0],
      });
    }

    if (listingId) {
      const exists = await pool.query(
        `
        SELECT id
        FROM public.listings
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        LIMIT 1
        `,
        [listingId, officeId]
      );

      if (!exists.rows[0]) {
        return res.status(404).json({ error: "LISTING_NOT_FOUND" });
      }

      const result = await pool.query(
        `
        INSERT INTO public.listing_notes (
          office_id,
          listing_id,
          user_id,
          note
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        RETURNING id::text, created_at, updated_at
        `,
        [officeId, listingId, userId, note]
      );

      return res.status(201).json({
        ok: true,
        noteSource: "listing",
        ...result.rows[0],
      });
    }

    if (eventId) {
      const exists = await pool.query(
        `
        SELECT id
        FROM public.events
        WHERE id = $1::uuid
          AND org_id = $2::uuid
        LIMIT 1
        `,
        [eventId, officeId]
      );

      if (!exists.rows[0]) {
        return res.status(404).json({ error: "EVENT_NOT_FOUND" });
      }

      const result = await pool.query(
        `
        INSERT INTO public.event_notes (
          office_id,
          event_id,
          user_id,
          note
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        RETURNING id::text, created_at, updated_at
        `,
        [officeId, eventId, userId, note]
      );

      return res.status(201).json({
        ok: true,
        noteSource: "event",
        ...result.rows[0],
      });
    }

    if (externalListingId) {
      const exists = await pool.query(
        `
        SELECT id
        FROM public.external_listings
        WHERE id = $1::uuid
        LIMIT 1
        `,
        [externalListingId]
      );

      if (!exists.rows[0]) {
        return res.status(404).json({ error: "EXTERNAL_LISTING_NOT_FOUND" });
      }

      const result = await pool.query(
        `
        INSERT INTO public.external_listing_notes (
          office_id,
          external_listing_id,
          user_id,
          note
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        RETURNING id::text, created_at, updated_at
        `,
        [officeId, externalListingId, userId, note]
      );

      return res.status(201).json({
        ok: true,
        noteSource: "external_listing",
        ...result.rows[0],
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

    console.error("NOTES_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}