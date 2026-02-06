import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // ✅ POST zamiast GET → brak ETag/304 na Vercel dla list endpointu
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // (Zostawiamy, ale to już nie jest krytyczne przy POST)
    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const body = req.body ?? {};
    const q = optString(body.q);
    const source = optString(body.source);
    const status = optString(body.status);
    const limit = Math.min(Math.max(optNumber(body.limit) ?? 50, 1), 200);

    const where: string[] = ["el.office_id = $1"];
    const params: any[] = [officeId];
    let p = 2;

    if (source) {
      where.push(`el.source = $${p++}`);
      params.push(source);
    }
    if (status) {
      where.push(`el.status = $${p++}::external_listing_status`);
      params.push(status);
    }
    if (q) {
      where.push(
        `(coalesce(el.title,'') ilike $${p}
          or coalesce(el.location_text,'') ilike $${p}
          or coalesce(el.source_url,'') ilike $${p})`
      );
      params.push(`%${q}%`);
      p++;
    }

    const { rows } = await pool.query(
      `
      select
        el.id as external_id,
        el.office_id,
        el.source,
        el.source_url,
        el.title,
        el.price_amount,
        el.currency,
        el.location_text,
        el.status,
        el.imported_at as imported_at,
        el.updated_at,
        null::text as thumb_url
      from external_listings el
      where ${where.join(" and ")}
      order by el.imported_at desc
      limit $${p}
      `,
      [...params, limit]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }
    console.error("EVERYBOT_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
