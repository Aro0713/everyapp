// pages/api/external_listings/by-phone.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type Row = {
  id: string;
  office_id: string | null;
  source: string;
  source_listing_id: string | null;
  source_url: string;
  title: string | null;
  description: string | null;
  price_amount: number | null;
  currency: string | null;
  location_text: string | null;
  status: string;
  shortlisted: boolean | null;
  imported_at: string | null;
  updated_at: string;
  thumb_url: string | null;
  matched_at: string | null;
  transaction_type: string | null;
  property_type: string | null;
  area_m2: number | null;
  price_per_m2: number | null;
  rooms: number | null;
  floor: string | null;
  year_built: number | null;
  voivodeship: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  owner_phone: string | null;
  source_status: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_checked_at: string | null;
  enriched_at: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
  geocode_source: string | null;
  geocode_confidence: number | null;
  rcn_last_price: number | null;
  rcn_last_date: string | null;
  rcn_link: string | null;
  rcn_enriched_at: string | null;
  handled_by_office_id: string | null;
  handled_since: string | null;
  last_interaction_at: string | null;
  last_action: string | null;
  my_office_saved: boolean | null;
  same_phone_offers_count: number | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const externalListingId = optString(req.query.externalListingId);
    if (!externalListingId) {
      return res.status(400).json({ error: "Missing externalListingId" });
    }

    const sql = `
      WITH base AS (
        SELECT
          l.id,
          RIGHT(REGEXP_REPLACE(COALESCE(l.owner_phone, l.phone, ''), '[^0-9]', '', 'g'), 9) AS phone_norm
        FROM external_listings l
        WHERE l.id = $1::uuid
      ),
      action_agg AS (
        SELECT
          external_listing_id,
          (ARRAY_AGG(office_id ORDER BY created_at DESC))[1] AS handled_by_office_id,
          MAX(created_at) AS last_interaction_at,
          (ARRAY_AGG(action ORDER BY created_at DESC))[1] AS last_action,
          MIN(created_at) FILTER (WHERE action = 'save') AS handled_since
        FROM external_listing_actions
        GROUP BY external_listing_id
      ),
      my_saved AS (
        SELECT
          external_listing_id,
          TRUE AS my_office_saved
        FROM external_listing_actions
        WHERE office_id = $2::uuid AND action = 'save'
        GROUP BY external_listing_id
      )
      SELECT
        l.id,
        l.office_id,
        l.source,
        l.source_listing_id,
        l.source_url,
        l.title,
        l.description,
        l.price_amount,
        l.currency,
        l.location_text,
        l.status,
        l.shortlisted,
        l.imported_at,
        l.updated_at,
        l.thumb_url,
        l.matched_at,
        l.transaction_type,
        l.property_type,
        l.area_m2,
        l.price_per_m2,
        l.rooms,
        l.floor,
        l.year_built,
        l.voivodeship,
        l.city,
        l.district,
        l.street,
        l.owner_phone,
        l.source_status,
        l.first_seen_at,
        l.last_seen_at,
        l.last_checked_at,
        l.enriched_at,
        l.lat,
        l.lng,
        l.geocoded_at,
        l.geocode_source,
        l.geocode_confidence,
        l.rcn_last_price,
        l.rcn_last_date,
        l.rcn_link,
        l.rcn_enriched_at,
        a.handled_by_office_id,
        a.handled_since,
        a.last_interaction_at,
        a.last_action,
        COALESCE(ms.my_office_saved, FALSE) AS my_office_saved,
        0::int AS same_phone_offers_count
      FROM external_listings l
      JOIN base b ON TRUE
      LEFT JOIN action_agg a ON a.external_listing_id = l.id
      LEFT JOIN my_saved ms ON ms.external_listing_id = l.id
      WHERE l.id <> $1::uuid
        AND b.phone_norm <> ''
        AND RIGHT(REGEXP_REPLACE(COALESCE(l.owner_phone, l.phone, ''), '[^0-9]', '', 'g'), 9) = b.phone_norm
      ORDER BY l.updated_at DESC, l.id DESC
      LIMIT 20
    `;

    const { rows } = await pool.query<Row>(sql, [externalListingId, officeId]);

    return res.status(200).json({ rows });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_BY_PHONE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}