import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function getIdParam(req: NextApiRequest): string | null {
  const raw = req.query.id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);
    const officeId = await getOfficeIdForUserId(userId);
    const id = getIdParam(req);

    if (!id) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    if (req.method === "GET") {
      const rowRes = await client.query(
        `
        SELECT
          c.id,
          c.office_id,
          c.party_type,
          c.full_name,
          c.pesel,
          c.nip,
          c.regon,
          c.krs,
          c.notes,
          c.source,
          c.created_by_user_id,
          c.assigned_user_id,
          c.status,
          c.pipeline_stage,
          c.created_at,
          c.updated_at,
          c.first_name,
          c.last_name,
          c.company_name,
          c.phone,
          c.email,
          c.contacts_count,
          c.has_interactions,
          c.interactions_count,
          c.client_roles
        FROM public.crm_contacts_view c
        WHERE c.id = $1
          AND c.office_id = $2
        LIMIT 1
        `,
        [id, officeId]
      );

      const row = rowRes.rows[0];
      if (!row) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      return res.status(200).json({ ok: true, row });
    }

    if (req.method === "DELETE") {
      const existing = await client.query(
        `
        SELECT id
        FROM public.parties
        WHERE id = $1
          AND office_id = $2
        LIMIT 1
        `,
        [id, officeId]
      );

      if (!existing.rows[0]) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      await client.query("BEGIN");

      await client.query(
        `DELETE FROM public.party_consents WHERE party_id = $1`,
        [id]
      );

      await client.query(
        `DELETE FROM public.party_roles WHERE party_id = $1 AND office_id = $2`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.party_contacts WHERE party_id = $1`,
        [id]
      );

      await client.query(
        `DELETE FROM public.party_person_details WHERE party_id = $1 AND office_id = $2`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.party_company_details WHERE party_id = $1 AND office_id = $2`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_visibility_rules
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_credit_details
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_insurance_details
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_offer_inquiries
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_order_details
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_case_properties
         WHERE client_case_id IN (
           SELECT id FROM public.client_cases WHERE party_id = $1 AND office_id = $2
         )`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.client_cases
         WHERE party_id = $1
           AND office_id = $2`,
        [id, officeId]
      );

      await client.query(
        `DELETE FROM public.listing_parties WHERE party_id = $1`,
        [id]
      );

      await client.query(
        `DELETE FROM public.parties
         WHERE id = $1
           AND office_id = $2`,
        [id, officeId]
      );

      await client.query("COMMIT");

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_ID_ROUTE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}