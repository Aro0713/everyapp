import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type ClientOption = {
  id: string;
  label: string;
  subtitle: string | null;
};

type ListingOption = {
  id: string;
  label: string;
  subtitle: string | null;
};

type ResponseShape = {
  clients: ClientOption[];
  listings: ListingOption[];
};

function optString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseShape | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const q = optString(req.query.q);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 10;

    const officeRes = await pool.query(
      `
      SELECT office_id
      FROM memberships
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY (role = 'owner') DESC, created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const officeId: string | null = officeRes.rows[0]?.office_id ?? null;
    if (!officeId) {
      return res.status(404).json({ error: "No active office membership for user" });
    }

    const like = `%${q}%`;

    const clientsPromise = pool.query(
      `
      SELECT
        p.id,
        p.full_name,
        cc.case_type,
        cc.status
      FROM parties p
      LEFT JOIN client_cases cc
        ON cc.party_id = p.id
       AND cc.office_id = p.office_id
      WHERE p.office_id = $1
        AND (
          $2::text = ''
          OR p.full_name ILIKE $3
          OR p.id::text ILIKE $3
        )
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
      LIMIT $4
      `,
      [officeId, q, like, limit]
    );

    const listingsPromise = pool.query(
      `
      SELECT
        l.id,
        l.offer_number,
        l.title,
        l.location_text,
        l.status
      FROM listings l
      WHERE l.office_id = $1
        AND (
          $2::text = ''
          OR COALESCE(l.offer_number, '') ILIKE $3
          OR COALESCE(l.title, '') ILIKE $3
          OR COALESCE(l.location_text, '') ILIKE $3
          OR l.id::text ILIKE $3
        )
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
      LIMIT $4
      `,
      [officeId, q, like, limit]
    );

    const [clientsRes, listingsRes] = await Promise.all([clientsPromise, listingsPromise]);

    const clients: ClientOption[] = clientsRes.rows.map((r) => ({
      id: r.id,
      label: r.full_name || "Bez nazwy",
      subtitle: [r.case_type, r.status].filter(Boolean).join(" • ") || null,
    }));

    const listings: ListingOption[] = listingsRes.rows.map((r) => {
      const labelCore =
        [r.offer_number, r.title].filter(Boolean).join(" — ") ||
        r.title ||
        r.offer_number ||
        "Bez tytułu";

      return {
        id: r.id,
        label: labelCore,
        subtitle: [r.location_text, r.status].filter(Boolean).join(" • ") || null,
      };
    });

    return res.status(200).json({ clients, listings });
  } catch (e: any) {
    console.error("CAL_LINK_OPTIONS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}