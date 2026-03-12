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

function optInt(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);

    const q = optString(req.query.q) ?? "";
    const partyType = optString(req.query.partyType);
    const limit = Math.min(optInt(req.query.limit, 50), 200);

    const params: any[] = [officeId];
    let idx = params.length + 1;

    const where: string[] = [`p.office_id = $1`];

    if (partyType) {
      where.push(`p.party_type::text = $${idx}`);
      params.push(partyType);
      idx++;
    }

    if (q.length >= 2) {
      where.push(`
        (
          p.full_name ILIKE '%' || $${idx} || '%'
          OR p.pesel = $${idx}
          OR p.nip = $${idx}
          OR p.krs = $${idx}
          OR EXISTS (
            SELECT 1
            FROM party_contacts pcx
            WHERE pcx.party_id = p.party_id
              AND pcx.value ILIKE '%' || $${idx} || '%'
          )
        )
      `);
      params.push(q);
      idx++;
    }

    params.push(limit);

    const sql = `
      SELECT
        p.party_id AS id,
        p.office_id,
        p.party_type::text AS party_type,
        p.full_name,
        p.pesel,
        p.nip,
        p.krs,
        p.created_at,

        MAX(CASE WHEN pc.kind::text = 'phone' AND pc.is_primary = true THEN pc.value END) AS phone_primary,
        MAX(CASE WHEN pc.kind::text = 'email' AND pc.is_primary = true THEN pc.value END) AS email_primary,
        MAX(CASE WHEN pc.kind::text = 'phone' THEN pc.value END) AS phone_fallback,
        MAX(CASE WHEN pc.kind::text = 'email' THEN pc.value END) AS email_fallback,

        COUNT(pc.id)::int AS contacts_count
      FROM office_parties p
      LEFT JOIN party_contacts pc
        ON pc.party_id = p.party_id
      WHERE ${where.join(" AND ")}
      GROUP BY
        p.party_id,
        p.office_id,
        p.party_type,
        p.full_name,
        p.pesel,
        p.nip,
        p.krs,
        p.created_at
      ORDER BY p.created_at DESC, p.full_name ASC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    const normalized = rows.map((row) => ({
      ...row,
      phone: row.phone_primary ?? row.phone_fallback ?? null,
      email: row.email_primary ?? row.email_fallback ?? null,
    }));

    return res.status(200).json({ rows: normalized });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}