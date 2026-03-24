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

function normalizeClientRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{}") return [];

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }
  }

  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(mustUserId(req));
    const id = optString(req.query.id);

    if (!id) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const baseSql = `
      WITH primary_case AS (
        SELECT
          cc.*,
          ROW_NUMBER() OVER (
            PARTITION BY cc.party_id
            ORDER BY
              CASE WHEN cc.status = 'active' THEN 0 ELSE 1 END,
              cc.created_at ASC
          ) AS rn
        FROM public.client_cases cc
        WHERE cc.office_id = $2
          AND cc.party_id = $1
      )
      SELECT
        c.id,
        c.office_id,
        c.party_type::text AS party_type,
        c.full_name,
        c.notes,
        c.source,
        c.created_by_user_id,
        c.assigned_user_id,
        c.status::text AS status,
        c.pipeline_stage::text AS pipeline_stage,
        c.created_at,
        c.updated_at,

        c.first_name,
        c.last_name,
        c.pesel,

        c.company_name,
        c.nip,
        c.regon,
        c.krs,

        c.phone,
        c.email,
        c.client_roles,
        c.has_interactions,
        c.interactions_count,

        pc.id AS client_case_id,
        pc.case_type::text AS case_type,
        pc.status::text AS client_case_status,
        pc.client_bucket,
        pc.assigned_user_id AS case_assigned_user_id,
        pc.created_by_user_id AS case_created_by_user_id,
        pc.source AS case_source,
        pc.notes AS case_notes,
        pc.created_at AS case_created_at,
        pc.updated_at AS case_updated_at
      FROM public.crm_contacts_view c
      LEFT JOIN primary_case pc
        ON pc.party_id = c.id
       AND pc.rn = 1
      WHERE c.id = $1
        AND c.office_id = $2
      LIMIT 1
    `;

    const baseResult = await pool.query(baseSql, [id, officeId]);
    const row = baseResult.rows[0];

    if (!row) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const clientCaseId: string | null = row.client_case_id ?? null;

    const [
      consentResult,
      visibilityResult,
      orderDetailsResult,
      propertyDetailsResult,
      offerInquiryResult,
      creditDetailsResult,
      insuranceDetailsResult,
    ] = await Promise.all([
      pool.query(
        `
        SELECT
          kind::text AS kind,
          granted,
          granted_at,
          revoked_at,
          source,
          notes,
          created_at
        FROM public.party_consents
        WHERE party_id = $1
          AND office_id = $2
          AND kind = 'marketing'::public.consent_kind
        LIMIT 1
        `,
        [id, officeId]
      ),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              visibility_scope::text AS visibility_scope,
              owner_user_id,
              owner_membership_id,
              created_at,
              updated_at
            FROM public.client_case_visibility_rules
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              property_kind::text AS property_kind,
              market_type::text AS market_type,
              contract_type::text AS contract_type,
              caretaker_user_id,
              expected_property_kind::text AS expected_property_kind,
              search_location_text,
              budget_min,
              budget_max,
              rooms_min,
              rooms_max,
              area_min,
              area_max,
              created_at,
              updated_at
            FROM public.client_case_order_details
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              country,
              city,
              street,
              building_number,
              unit_number,
              price_amount,
              price_currency,
              price_period,
              area_m2,
              rooms_count,
              floor_number,
              floor_total,
              created_at,
              updated_at
            FROM public.client_case_properties
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              offer_id,
              inquiry_text,
              autofill_from_offer,
              autofill_margin_percent,
              created_at,
              updated_at
            FROM public.client_case_offer_inquiries
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              credited_property_price,
              planned_own_contribution,
              loan_period_months,
              concerns_existing_property,
              related_offer_id,
              existing_property_notes,
              created_at,
              updated_at
            FROM public.client_case_credit_details
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
      clientCaseId
        ? pool.query(
            `
            SELECT
              client_case_id,
              insurance_subject::text AS insurance_subject,
              insurance_notes,
              created_at,
              updated_at
            FROM public.client_case_insurance_details
            WHERE client_case_id = $1
              AND office_id = $2
            LIMIT 1
            `,
            [clientCaseId, officeId]
          )
        : Promise.resolve({ rows: [] as any[] }),
    ]);

    return res.status(200).json({
      row: {
        ...row,
        client_roles: normalizeClientRoles(row.client_roles),
      },
      consent: consentResult.rows[0] ?? null,
      visibilityRule: visibilityResult.rows[0] ?? null,
      orderDetails: orderDetailsResult.rows[0] ?? null,
      propertyDetails: propertyDetailsResult.rows[0] ?? null,
      offerInquiry: offerInquiryResult.rows[0] ?? null,
      creditDetails: creditDetailsResult.rows[0] ?? null,
      insuranceDetails: insuranceDetailsResult.rows[0] ?? null,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_DETAILS_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}