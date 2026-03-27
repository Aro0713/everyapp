import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

type PartyLinkInput = {
  role: "seller" | "buyer" | "landlord" | "tenant";
  partyId: string;
  isPrimary?: boolean;
};

const ALLOWED_RECORD_TYPES = new Set(["offer", "search"]);
const ALLOWED_TX_TYPES = new Set(["sale", "rent"]);
const ALLOWED_STATUSES = new Set(["draft", "active", "closed", "archived"]);
const ALLOWED_ROLES = new Set(["seller", "buyer", "landlord", "tenant"]);

function slugToken(value: string | null | undefined, fallback: string, maxLen: number) {
  const raw = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const token = raw.slice(0, maxLen);
  return token || fallback;
}

function buildAgentToken(fullName: string | null | undefined, email: string | null | undefined) {
  const normalizedName = (fullName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalizedName) {
    const parts = normalizedName
      .split(/\s+/)
      .map((x) => x.replace(/[^A-Za-z0-9]/g, ""))
      .filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0][0] ?? "";
      const last = parts[parts.length - 1][0] ?? "";
      const initials = `${first}${last}`.toUpperCase();
      if (initials) return initials;
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 3).toUpperCase();
    }
  }

  const emailLocal = (email ?? "").split("@")[0]?.replace(/[^A-Za-z0-9]/g, "") ?? "";
  return emailLocal.slice(0, 3).toUpperCase() || "USR";
}

async function generateOfferNumber(
  client: any,
  officeId: string,
  caseOwnerUserId: string
): Promise<string> {
  const officeRes = await client.query(
    `
    SELECT name, invite_code
    FROM public.offices
    WHERE id = $1
    LIMIT 1
    `,
    [officeId]
  );

  const office = officeRes.rows[0];
  if (!office) throw new Error("OFFICE_NOT_FOUND");

  const userRes = await client.query(
    `
    SELECT full_name, email
    FROM public.users
    WHERE id = $1
    LIMIT 1
    `,
    [caseOwnerUserId]
  );

  const user = userRes.rows[0];
  if (!user) throw new Error("CASE_OWNER_NOT_FOUND");

  const officeToken = slugToken(office.invite_code ?? office.name, "OFFICE", 6);
  const agentToken = buildAgentToken(user.full_name, user.email);
  const year = new Date().getFullYear().toString();

  const seqRes = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SPLIT_PART(offer_number, '/', 1) AS INTEGER)), 0) AS max_seq
    FROM public.listings
    WHERE office_id = $1
      AND offer_number IS NOT NULL
      AND RIGHT(offer_number, 4) = $2
    `,
    [officeId, year]
  );

  const nextSeq = Number(seqRes.rows[0]?.max_seq ?? 0) + 1;
  const seq = String(nextSeq).padStart(4, "0");

  return `${seq}/${officeToken}/${agentToken}/${year}`;
}

function deriveRoleFromContext(
  recordType: string,
  transactionType: string
): "seller" | "buyer" | "landlord" | "tenant" {
  if (recordType === "search") {
    return transactionType === "rent" ? "tenant" : "buyer";
  }
  return transactionType === "rent" ? "landlord" : "seller";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const sessionUserId = getUserIdFromRequest(req);
    if (!sessionUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(sessionUserId);

    const body = req.body ?? {};

    const recordType = optString(body.recordType) ?? "offer";
    const transactionType = optString(body.transactionType) ?? "sale";
    const status = optString(body.status) ?? "draft";

    if (!ALLOWED_RECORD_TYPES.has(recordType)) {
      return res.status(400).json({ error: "Invalid recordType" });
    }
    if (!ALLOWED_TX_TYPES.has(transactionType)) {
      return res.status(400).json({ error: "Invalid transactionType" });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const currency = optString(body.currency) ?? "PLN";
    const priceAmount = optNumber(body.priceAmount);
    const budgetMin = optNumber(body.budgetMin);
    const budgetMax = optNumber(body.budgetMax);
    const locationText = optString(body.locationText);

    const caseOwnerUserId = optString(body.caseOwnerUserId) ?? sessionUserId;
    const clientId = optString(body.clientId);
    const clientRoleRaw = optString(body.clientRole);

    const partiesRaw = Array.isArray(body.parties) ? (body.parties as PartyLinkInput[]) : [];
    const parties: PartyLinkInput[] = partiesRaw
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        role: p.role,
        partyId: p.partyId,
        isPrimary: !!p.isPrimary,
      }))
      .filter(
        (p) =>
          ALLOWED_ROLES.has(p.role) &&
          typeof p.partyId === "string" &&
          p.partyId.length > 10
      );

    if (clientId && !parties.some((p) => p.partyId === clientId)) {
      const derivedRole =
        clientRoleRaw && ALLOWED_ROLES.has(clientRoleRaw)
          ? (clientRoleRaw as "seller" | "buyer" | "landlord" | "tenant")
          : deriveRoleFromContext(recordType, transactionType);

      parties.push({
        role: derivedRole,
        partyId: clientId,
        isPrimary: parties.length === 0,
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const ownerCheck = await client.query(
        `
        SELECT 1
        FROM public.memberships
        WHERE user_id = $1
          AND office_id = $2
          AND status = 'active'
        LIMIT 1
        `,
        [caseOwnerUserId, officeId]
      );

      if (!ownerCheck.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "CASE_OWNER_NOT_IN_OFFICE" });
      }

      if (clientId) {
        const partyCheck = await client.query(
          `
          SELECT 1
          FROM public.parties
          WHERE id = $1
            AND office_id = $2
          LIMIT 1
          `,
          [clientId, officeId]
        );

        if (!partyCheck.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "CLIENT_NOT_FOUND" });
        }
      }

      if (parties.length > 0) {
        const partyIds = parties.map((p) => p.partyId);

        const partyCheck = await client.query(
          `
          SELECT id
          FROM public.parties
          WHERE office_id = $1
            AND id = ANY($2::uuid[])
          `,
          [officeId, partyIds]
        );

        const foundIds = new Set<string>(partyCheck.rows.map((r: any) => r.id));
        const missing = partyIds.find((id) => !foundIds.has(id));

        if (missing) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "PARTY_NOT_FOUND_IN_OFFICE" });
        }
      }

      const offerNumber = await generateOfferNumber(client, officeId, caseOwnerUserId);

      const ins = await client.query(
        `
        INSERT INTO public.listings (
          office_id,
          record_type,
          transaction_type,
          status,
          created_by_user_id,
          case_owner_user_id,
          currency,
          price_amount,
          budget_min,
          budget_max,
          location_text,
          offer_number
        )
        VALUES (
          $1,
          $2::listing_record_type,
          $3::transaction_type,
          $4::listing_status,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        RETURNING id, offer_number
        `,
        [
          officeId,
          recordType,
          transactionType,
          status,
          sessionUserId,
          caseOwnerUserId,
          currency,
          priceAmount,
          budgetMin,
          budgetMax,
          locationText,
          offerNumber,
        ]
      );

      const listingId: string = ins.rows[0]?.id;
      const createdOfferNumber: string | null = ins.rows[0]?.offer_number ?? null;

      if (!listingId) throw new Error("Failed to create listing");

      for (const p of parties) {
        await client.query(
          `
          INSERT INTO public.listing_parties (
            listing_id,
            party_id,
            role,
            is_primary
          )
          VALUES ($1, $2, $3::public.listing_party_role, $4)
          ON CONFLICT (listing_id, party_id, role) DO NOTHING
          `,
          [listingId, p.partyId, p.role, p.isPrimary]
        );
      }

      await client.query("COMMIT");

      return res.status(201).json({
        id: listingId,
        offerNumber: createdOfferNumber,
      });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}