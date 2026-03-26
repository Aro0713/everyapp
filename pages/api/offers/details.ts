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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const listingId = optString(req.query.id);

    if (!listingId) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const listingRes = await client.query(
      `
      SELECT
        l.id,
        l.office_id,
        l.offer_number,
        l.record_type,
        l.transaction_type,
        l.status,
        l.created_by_user_id,
        l.case_owner_user_id,
        l.contract_type,
        l.market,
        l.internal_notes,
        l.currency,
        l.price_amount,
        l.budget_min,
        l.budget_max,
        l.area_min_m2,
        l.area_max_m2,
        l.rooms_min,
        l.rooms_max,
        l.location_text,
        l.title,
        l.description,
        l.property_type,
        l.area_m2,
        l.rooms,
        l.floor,
        l.year_built,
        l.voivodeship,
        l.city,
        l.district,
        l.street,
        l.postal_code,
        l.lat,
        l.lng,
        l.created_at,
        l.updated_at
      FROM public.listings l
      WHERE l.id = $1
        AND l.office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    const listing = listingRes.rows[0];
    if (!listing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const partyRes = await client.query(
      `
      SELECT
        p.id,
        p.full_name,
        p.party_type::text AS party_type,
        p.notes,
        p.source,
        p.created_by_user_id,
        p.assigned_user_id,
        p.status::text AS status,
        p.pipeline_stage::text AS pipeline_stage,
        p.created_at,
        p.updated_at,

        ppd.first_name,
        ppd.last_name,
        ppd.pesel,

        pcd.company_name,
        pcd.nip,
        pcd.regon,
        pcd.krs,

        phone_contact.value AS phone,
        email_contact.value AS email,

        lp.role::text AS listing_party_role,
        lp.notes AS listing_party_notes
      FROM public.listing_parties lp
      JOIN public.parties p
        ON p.id = lp.party_id
      LEFT JOIN public.party_person_details ppd
        ON ppd.party_id = p.id
      LEFT JOIN public.party_company_details pcd
        ON pcd.party_id = p.id
      LEFT JOIN LATERAL (
        SELECT pc.value
        FROM public.party_contacts pc
        WHERE pc.party_id = p.id
          AND pc.kind = 'phone'::public.contact_kind
        ORDER BY pc.is_primary DESC, pc.created_at ASC
        LIMIT 1
      ) phone_contact ON true
      LEFT JOIN LATERAL (
        SELECT pc.value
        FROM public.party_contacts pc
        WHERE pc.party_id = p.id
          AND pc.kind = 'email'::public.contact_kind
        ORDER BY pc.is_primary DESC, pc.created_at ASC
        LIMIT 1
      ) email_contact ON true
      WHERE lp.listing_id = $1
      ORDER BY lp.is_primary DESC
      LIMIT 1
      `,
      [listingId]
    );

    const party = partyRes.rows[0] ?? null;

    const ownerUserRes = await client.query(
      `
      SELECT id, full_name, email
      FROM public.users
      WHERE id = $1
      LIMIT 1
      `,
      [listing.case_owner_user_id ?? listing.created_by_user_id]
    );

    const ownerUser = ownerUserRes.rows[0] ?? null;

    const history: Array<{
      type: string;
      label: string;
      value: string | null;
    }> = [
      { type: "offer_created", label: "Utworzenie oferty", value: listing.created_at ?? null },
      { type: "offer_updated", label: "Ostatnia zmiana oferty", value: listing.updated_at ?? null },
      { type: "party_created", label: "Utworzenie klienta", value: party?.created_at ?? null },
      { type: "party_updated", label: "Ostatnia zmiana klienta", value: party?.updated_at ?? null },
    ];

    return res.status(200).json({
      ok: true,
      listing,
      party,
      ownerUser,
      history,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_DETAILS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}