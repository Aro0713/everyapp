import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const body = req.body ?? {};
    const externalId = mustString(body.externalId, "externalId");
    const sourceImageUrl = mustString(body.sourceImageUrl, "sourceImageUrl");
    const sortOrder = optNumber(body.sortOrder) ?? 0;

    const chk = await pool.query(
      `SELECT 1 FROM external_listings WHERE id = $1 AND office_id = $2 LIMIT 1`,
      [externalId, officeId]
    );
    if (!chk.rows[0]) return res.status(403).json({ error: "FORBIDDEN" });

    await pool.query(
      `
      INSERT INTO external_listing_images (external_listing_id, source_image_url, sort_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (external_listing_id, source_image_url) DO NOTHING
      `,
      [externalId, sourceImageUrl, sortOrder]
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    console.error("EVERYBOT_ADD_IMAGE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

export default handler;
