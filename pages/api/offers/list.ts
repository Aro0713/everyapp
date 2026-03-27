import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type OfficeListingRow = {
  id: string;
  office_id: string;
  record_type: string;
  transaction_type: string;
  status: string;
  created_at: string | Date;
  case_owner_name: string | null;
  parties_summary: string | null;
  price_amount: string | number | null;
  currency: string | null;
  location_text: string | null;
};

type PortalSavedRow = {
  action_id: string;
  office_id: string;
  external_listing_id: string;
  action: string;
  created_at: string | Date;
  source: string;
  source_url: string;
  title: string | null;
  description: string | null;
  price_amount: string | number | null;
  currency: string | null;
  location_text: string | null;
  thumb_url: string | null;
  transaction_type: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const limitRaw = optNumber(req.query.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);
    const clientId = optString(req.query.clientId);

    const crmParams: Array<string | number> = [officeId];
    let crmWhere = `WHERE l.office_id = $1::uuid`;

    if (clientId) {
      crmParams.push(clientId);
      crmWhere += `
        AND EXISTS (
          SELECT 1
          FROM public.listing_parties lp_filter
          WHERE lp_filter.listing_id = l.id
            AND lp_filter.party_id = $2::uuid
        )
      `;
    }

    const crmQuery = pool.query<OfficeListingRow>(
      `
      SELECT
        l.id::text AS id,
        l.office_id::text,
        l.record_type::text,
        l.transaction_type::text,
        l.status::text,
        l.created_at,
        ou.full_name AS case_owner_name,
        string_agg(
          DISTINCT CASE lp.role
            WHEN 'seller'::public.listing_party_role THEN 'Sprzedający: ' || p.full_name
            WHEN 'buyer'::public.listing_party_role THEN 'Kupujący: ' || p.full_name
            WHEN 'landlord'::public.listing_party_role THEN 'Wynajmujący: ' || p.full_name
            WHEN 'tenant'::public.listing_party_role THEN 'Najemca: ' || p.full_name
            ELSE lp.role::text || ': ' || p.full_name
          END,
          ' | '
        ) AS parties_summary,
        l.price_amount,
        l.currency,
        l.location_text
      FROM public.listings l
      LEFT JOIN public.listing_parties lp
        ON lp.listing_id = l.id
      LEFT JOIN public.parties p
        ON p.id = lp.party_id
      LEFT JOIN public.office_users ou
        ON ou.user_id = l.case_owner_user_id
       AND ou.office_id = l.office_id
      ${crmWhere}
      GROUP BY
        l.id,
        l.office_id,
        l.record_type,
        l.transaction_type,
        l.status,
        l.created_at,
        ou.full_name,
        l.price_amount,
        l.currency,
        l.location_text
      `,
      crmParams
    );

    const portalQuery = clientId
      ? Promise.resolve({ rows: [] as PortalSavedRow[] })
      : pool.query<PortalSavedRow>(
          `
          SELECT
            ela.id::text AS action_id,
            ela.office_id::text,
            ela.external_listing_id::text,
            ela.action::text,
            ela.created_at,
            el.source,
            el.source_url,
            el.title,
            el.description,
            el.price_amount,
            el.currency,
            el.location_text,
            el.thumb_url,
            el.transaction_type
          FROM (
            SELECT DISTINCT ON (external_listing_id)
              id,
              office_id,
              external_listing_id,
              action,
              created_at
            FROM public.external_listing_actions
            WHERE office_id = $1::uuid
              AND action IN ('save', 'call', 'visit')
            ORDER BY external_listing_id, created_at DESC
          ) ela
          JOIN public.external_listings el
            ON el.id = ela.external_listing_id
          ORDER BY ela.created_at DESC
          `,
          [officeId]
        );

    const [crmRes, portalRes] = await Promise.all([crmQuery, portalQuery]);

    const crmRows = crmRes.rows.map((r) => ({
      id: r.id,
      item_source: "crm" as const,
      office_id: r.office_id,
      record_type: r.record_type,
      transaction_type: r.transaction_type,
      status: r.status,
      created_at:
        typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
      case_owner_name: r.case_owner_name,
      parties_summary: r.parties_summary,
      title: r.record_type === "offer" ? "Oferta CRM" : "Poszukiwanie CRM",
      description: null,
      price_amount: r.price_amount,
      currency: r.currency,
      location_text: r.location_text,
      thumb_url: null,
      source_url: null,
      action: null,
      source: null,
      external_listing_id: null,
    }));

    const portalRows = portalRes.rows.map((r) => ({
      id: r.action_id,
      item_source: "portal" as const,
      office_id: r.office_id,
      record_type: "offer",
      transaction_type: r.transaction_type ?? "sale",
      status: "saved",
      created_at:
        typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
      case_owner_name: null,
      parties_summary: null,
      title: r.title ?? "Oferta z portalu",
      description: r.description ?? null,
      price_amount: r.price_amount,
      currency: r.currency,
      location_text: r.location_text,
      thumb_url: r.thumb_url,
      source_url: r.source_url,
      action: r.action,
      source: r.source,
      external_listing_id: r.external_listing_id,
    }));

    const rows = [...crmRows, ...portalRows]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);

    return res.status(200).json({
      rows,
      meta: {
        officeId,
        clientId,
        limit,
        count: rows.length,
        crmCount: crmRows.length,
        portalCount: portalRows.length,
      },
    });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}