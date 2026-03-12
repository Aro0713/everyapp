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

function optInt(v: unknown): number | null {
  const n = optNumber(v);
  return Number.isInteger(n) ? n : null;
}

async function ensureOfficeAccess(userId: string, officeId: string) {
  const r = await pool.query(
    `
    SELECT 1
    FROM memberships
    WHERE user_id = $1
      AND office_id = $2
      AND status = 'active'
    LIMIT 1
    `,
    [userId, officeId]
  );

  return !!r.rows[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const sessionUserId = getUserIdFromRequest(req);
    if (!sessionUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(sessionUserId);
    const id = typeof req.query.id === "string" ? req.query.id : null;
    if (!id) return res.status(400).json({ error: "Missing id" });

    if (req.method === "GET") {
      const q = await pool.query(
        `
        SELECT
          id,
          office_id,
          record_type,
          transaction_type,
          status,
          contract_type,
          market,
          internal_notes,
          currency,
          price_amount,
          budget_min,
          budget_max,
          area_min_m2,
          area_max_m2,
          rooms_min,
          rooms_max,
          location_text,
          title,
          description,
          property_type,
          area_m2,
          rooms,
          floor,
          year_built,
          voivodeship,
          city,
          district,
          street,
          postal_code,
          lat,
          lng,
          created_at,
          updated_at
        FROM public.listings
        WHERE id = $1
          AND office_id = $2
        LIMIT 1
        `,
        [id, officeId]
      );

      const row = q.rows[0];
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });

      const access = await ensureOfficeAccess(sessionUserId, row.office_id);
      if (!access) return res.status(403).json({ error: "FORBIDDEN" });

      return res.status(200).json({ row });
    }

    if (req.method === "PUT") {
      const body = req.body ?? {};

      const q = await pool.query(
        `
        SELECT id, office_id
        FROM public.listings
        WHERE id = $1
          AND office_id = $2
        LIMIT 1
        `,
        [id, officeId]
      );

      const row = q.rows[0];
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });

      const access = await ensureOfficeAccess(sessionUserId, row.office_id);
      if (!access) return res.status(403).json({ error: "FORBIDDEN" });

      const payload = {
        title: optString(body.title),
        description: optString(body.description),
        property_type: optString(body.property_type),
        contract_type: optString(body.contract_type),
        market: optString(body.market),
        internal_notes: optString(body.internal_notes),
        currency: optString(body.currency) ?? "PLN",
        location_text: optString(body.location_text),
        voivodeship: optString(body.voivodeship),
        city: optString(body.city),
        district: optString(body.district),
        street: optString(body.street),
        postal_code: optString(body.postal_code),
        floor: optString(body.floor),

        price_amount: optNumber(body.price_amount),
        budget_min: optNumber(body.budget_min),
        budget_max: optNumber(body.budget_max),
        area_min_m2: optNumber(body.area_min_m2),
        area_max_m2: optNumber(body.area_max_m2),
        area_m2: optNumber(body.area_m2),
        lat: optNumber(body.lat),
        lng: optNumber(body.lng),

        rooms_min: optInt(body.rooms_min),
        rooms_max: optInt(body.rooms_max),
        rooms: optInt(body.rooms),
        year_built: optInt(body.year_built),

        transaction_type: optString(body.transaction_type),
        status: optString(body.status),
      };

      await pool.query(
        `
        UPDATE public.listings
        SET
          title = $2,
          description = $3,
          property_type = $4,
          contract_type = $5,
          market = $6,
          internal_notes = $7,
          currency = $8,
          location_text = $9,
          voivodeship = $10,
          city = $11,
          district = $12,
          street = $13,
          postal_code = $14,
          floor = $15,
          price_amount = $16,
          budget_min = $17,
          budget_max = $18,
          area_min_m2 = $19,
          area_max_m2 = $20,
          area_m2 = $21,
          lat = $22,
          lng = $23,
          rooms_min = $24,
          rooms_max = $25,
          rooms = $26,
          year_built = $27,
          transaction_type = COALESCE($28::transaction_type, transaction_type),
          status = COALESCE($29::listing_status, status),
          updated_at = now()
        WHERE id = $1
          AND office_id = $30
        `,
        [
          id,
          payload.title,
          payload.description,
          payload.property_type,
          payload.contract_type,
          payload.market,
          payload.internal_notes,
          payload.currency,
          payload.location_text,
          payload.voivodeship,
          payload.city,
          payload.district,
          payload.street,
          payload.postal_code,
          payload.floor,
          payload.price_amount,
          payload.budget_min,
          payload.budget_max,
          payload.area_min_m2,
          payload.area_max_m2,
          payload.area_m2,
          payload.lat,
          payload.lng,
          payload.rooms_min,
          payload.rooms_max,
          payload.rooms,
          payload.year_built,
          payload.transaction_type,
          payload.status,
          officeId,
        ]
      );

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("OFFER_ID_API_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}