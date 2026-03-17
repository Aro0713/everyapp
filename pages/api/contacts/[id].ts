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

const ALLOWED_CLIENT_ROLES = new Set([
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "investor",
  "flipper",
  "developer",
  "external_agent",
] as const);

type ClientRole =
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "investor"
  | "flipper"
  | "developer"
  | "external_agent";

type ContactPayload = {
  id: string | null;
  partyType: "person" | "company";
  clientRoles: ClientRole[];
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  source: string | null;
  pesel: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
};

function normalizeRoles(value: unknown): ClientRole[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<ClientRole>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const role = item.trim();
    if (!role) continue;
    if (ALLOWED_CLIENT_ROLES.has(role as ClientRole)) {
      unique.add(role as ClientRole);
    }
  }

  return Array.from(unique);
}

function normalizePayload(body: any): ContactPayload {
  const partyType = optString(body?.partyType) === "company" ? "company" : "person";

  const firstName = optString(body?.firstName);
  const lastName = optString(body?.lastName);
  const companyName = optString(body?.companyName);

  const derivedFullName =
    partyType === "company"
      ? companyName
      : [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  return {
    id: optString(body?.id),
    partyType,
    clientRoles: normalizeRoles(body?.clientRoles),
    fullName: optString(body?.fullName) ?? derivedFullName,
    firstName,
    lastName,
    companyName,
    phone: optString(body?.phone),
    email: optString(body?.email),
    notes: optString(body?.notes),
    source: optString(body?.source) ?? "manual",
    pesel: optString(body?.pesel),
    nip: optString(body?.nip),
    regon: optString(body?.regon),
    krs: optString(body?.krs),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const payload = normalizePayload(req.body ?? {});

    if (!payload.id) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    if (!payload.fullName) {
      return res.status(400).json({ error: "MISSING_FULL_NAME" });
    }

    if (!payload.phone && !payload.email) {
      return res.status(400).json({ error: "MISSING_CONTACT_CHANNEL" });
    }

    if (payload.partyType === "person" && (!payload.firstName || !payload.lastName)) {
      return res.status(400).json({ error: "MISSING_PERSON_NAME_PARTS" });
    }

    if (payload.partyType === "company" && !payload.companyName && !payload.fullName) {
      return res.status(400).json({ error: "MISSING_COMPANY_NAME" });
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `
      SELECT id, office_id, party_type::text AS party_type
      FROM public.parties
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [payload.id, officeId]
    );

    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    await client.query(
      `
      UPDATE public.parties
      SET
        party_type = $2::public.party_type,
        full_name = $3,
        notes = $4,
        source = $5,
        updated_at = now()
      WHERE id = $1
        AND office_id = $6
      `,
      [
        payload.id,
        payload.partyType,
        payload.fullName,
        payload.notes,
        payload.source,
        officeId,
      ]
    );

    if (payload.partyType === "person") {
      await client.query(
        `
        DELETE FROM public.party_company_details
        WHERE party_id = $1
          AND office_id = $2
        `,
        [payload.id, officeId]
      );

      await client.query(
        `
        INSERT INTO public.party_person_details (
          party_id,
          office_id,
          first_name,
          last_name,
          pesel,
          id_doc_type,
          id_doc_number
        )
        VALUES (
          $1, $2, $3, $4, $5, NULL, NULL
        )
        ON CONFLICT (party_id) DO UPDATE
        SET
          office_id = EXCLUDED.office_id,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          pesel = EXCLUDED.pesel
        `,
        [
          payload.id,
          officeId,
          payload.firstName,
          payload.lastName,
          payload.pesel,
        ]
      );
    }

    if (payload.partyType === "company") {
      await client.query(
        `
        DELETE FROM public.party_person_details
        WHERE party_id = $1
          AND office_id = $2
        `,
        [payload.id, officeId]
      );

      await client.query(
        `
        INSERT INTO public.party_company_details (
          party_id,
          office_id,
          company_name,
          nip,
          regon,
          krs
        )
        VALUES (
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (party_id) DO UPDATE
        SET
          office_id = EXCLUDED.office_id,
          company_name = EXCLUDED.company_name,
          nip = EXCLUDED.nip,
          regon = EXCLUDED.regon,
          krs = EXCLUDED.krs
        `,
        [
          payload.id,
          officeId,
          payload.companyName ?? payload.fullName,
          payload.nip,
          payload.regon,
          payload.krs,
        ]
      );
    }

    await client.query(
      `
      DELETE FROM public.party_contacts
      WHERE party_id = $1
      `,
      [payload.id]
    );

    if (payload.phone) {
      await client.query(
        `
        INSERT INTO public.party_contacts (
          party_id,
          kind,
          value,
          is_primary
        )
        VALUES (
          $1,
          'phone'::public.contact_kind,
          $2,
          true
        )
        `,
        [payload.id, payload.phone]
      );
    }

    if (payload.email) {
      await client.query(
        `
        INSERT INTO public.party_contacts (
          party_id,
          kind,
          value,
          is_primary
        )
        VALUES (
          $1,
          'email'::public.contact_kind,
          $2,
          $3
        )
        `,
        [payload.id, payload.email, payload.phone ? false : true]
      );
    }

    await client.query(
      `
      DELETE FROM public.party_roles
      WHERE party_id = $1
        AND office_id = $2
      `,
      [payload.id, officeId]
    );

    if (payload.clientRoles.length > 0) {
      for (const role of payload.clientRoles) {
        await client.query(
          `
          INSERT INTO public.party_roles (
            office_id,
            party_id,
            role
          )
          VALUES (
            $1,
            $2,
            $3::public.party_role_type
          )
          ON CONFLICT (office_id, party_id, role) DO NOTHING
          `,
          [officeId, payload.id, role]
        );
      }
    }

    const refreshed = await client.query(
      `
      SELECT
        id,
        office_id,
        party_type::text AS party_type,
        full_name,
        notes,
        source,
        created_by_user_id,
        created_at,
        updated_at,
        first_name,
        last_name,
        pesel,
        company_name,
        nip,
        regon,
        krs,
        phone,
        email,
        client_roles,
        has_interactions,
        interactions_count
      FROM public.crm_contacts_view
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [payload.id, officeId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      row: refreshed.rows[0] ?? null,
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_UPDATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}