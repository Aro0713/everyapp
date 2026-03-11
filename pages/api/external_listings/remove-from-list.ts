import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const body = req.body ?? {};
    const externalListingId = mustString(body.external_listing_id, "external_listing_id");

    await pool.query(
      `
      DELETE FROM external_listing_actions
      WHERE office_id = $1::uuid
        AND external_listing_id = $2::uuid
      `,
      [officeId, externalListingId]
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("REMOVE_FROM_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}