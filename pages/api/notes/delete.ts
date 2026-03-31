import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type NoteSource = "client" | "listing" | "event" | "external_listing";

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

function isNoteSource(v: string | null): v is NoteSource {
  return (
    v === "client" ||
    v === "listing" ||
    v === "event" ||
    v === "external_listing"
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "DELETE") {
      res.setHeader("Allow", "POST,DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    mustUserId(req);
    const officeId = await getOfficeIdForUserId(mustUserId(req));

    const id = mustString(req.body?.id ?? req.query.id, "id");
    const sourceRaw = mustString(req.body?.source ?? req.query.source, "source");

    if (!isNoteSource(sourceRaw)) {
      throw new Error("INVALID_SOURCE");
    }

    if (sourceRaw === "client") {
      await pool.query(
        `
        DELETE FROM public.client_notes
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        `,
        [id, officeId]
      );
    }

    if (sourceRaw === "listing") {
      await pool.query(
        `
        DELETE FROM public.listing_notes
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        `,
        [id, officeId]
      );
    }

    if (sourceRaw === "event") {
      await pool.query(
        `
        DELETE FROM public.event_notes
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        `,
        [id, officeId]
      );
    }

    if (sourceRaw === "external_listing") {
      await pool.query(
        `
        DELETE FROM public.external_listing_notes
        WHERE id = $1::uuid
          AND office_id = $2::uuid
        `,
        [id, officeId]
      );
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("NOTES_DELETE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}