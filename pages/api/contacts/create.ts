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

type ContactPayload = {
  partyType: "person" | "company";
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
    partyType,
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

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const payload = normalizePayload(req.body ?? {});

    if (!payload.fullName) {
      return res.status(400).json({ error: "MISSING_FULL_NAME" });
    }

    if (!payload.phone && !payload.email) {
      return res.status(400).json({ error: "MISSING_CONTACT_CHANNEL" });
    }

    await client.query("BEGIN");

    const partyInsert = await client.query(
      `
      INSERT INTO public.parties (
        office_id,
        party_type,
        full_name,
        notes,
        source,
        created_by_user_id
      )
      VALUES (
        $1,
        $2::party_type,
        $3,
        $4,
        $5,
        $6
      )
      RETURNING id, office_id, party_type, full_name, created_at
      `,
      [
        officeId,
        payload.partyType,
        payload.fullName,
        payload.notes,
        payload.source,
        userId,
      ]
    );

    const party = partyInsert.rows[0];
    const partyId = party.id as string;

    if (payload.partyType === "person") {
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
        `,
        [
          partyId,
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
        `,
        [
          partyId,
          officeId,
          payload.companyName ?? payload.fullName,
          payload.nip,
          payload.regon,
          payload.krs,
        ]
      );
    }

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
          $2,
          $3,
          true
        )
        `,
        [partyId, "phone", payload.phone]
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
          $2,
          $3,
          $4
        )
        `,
        [partyId, "email", payload.email, payload.phone ? false : true]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      row: {
        id: party.id,
        office_id: party.office_id,
        party_type: party.party_type,
        full_name: party.full_name,
        created_at: party.created_at,
        phone: payload.phone,
        email: payload.email,
      },
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}