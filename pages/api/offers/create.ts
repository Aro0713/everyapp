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

    if (!ALLOWED_RECORD_TYPES.has(recordType)) return res.status(400).json({ error: "Invalid recordType" });
    if (!ALLOWED_TX_TYPES.has(transactionType)) return res.status(400).json({ error: "Invalid transactionType" });
    if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: "Invalid status" });

    const currency = optString(body.currency) ?? "PLN";
    const priceAmount = optNumber(body.priceAmount);
    const budgetMin = optNumber(body.budgetMin);
    const budgetMax = optNumber(body.budgetMax);
    const locationText = optString(body.locationText);

    // Opiekun transakcji: domyślnie user zalogowany
    const caseOwnerUserId = optString(body.caseOwnerUserId) ?? sessionUserId;

    // Parties (opcjonalnie)
    const partiesRaw = Array.isArray(body.parties) ? (body.parties as PartyLinkInput[]) : [];
    const parties: PartyLinkInput[] = partiesRaw
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        role: p.role,
        partyId: p.partyId,
        isPrimary: !!p.isPrimary,
      }))
      .filter((p) => ALLOWED_ROLES.has(p.role) && typeof p.partyId === "string" && p.partyId.length > 10);

    // Zaczynamy transakcję w DB
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // (Opcjonalnie) walidacja: caseOwnerUserId musi należeć do tego biura
      // Skoro user ma jedno biuro, a opiekun to zwykle ktoś z tego biura, sprawdzamy membership.
      const ownerCheck = await client.query(
        `
        SELECT 1
        FROM memberships
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

      const ins = await client.query(
        `
        INSERT INTO listings (
          office_id, record_type, transaction_type, status,
          created_by_user_id, case_owner_user_id,
          currency, price_amount, budget_min, budget_max, location_text
        )
        VALUES ($1, $2::listing_record_type, $3::transaction_type, $4::listing_status,
                $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
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
        ]
      );

      const listingId: string = ins.rows[0]?.id;
      if (!listingId) throw new Error("Failed to create listing");

      // Podpinanie stron (opcjonalnie)
      for (const p of parties) {
        await client.query(
          `
          INSERT INTO listing_parties (listing_id, party_id, role, is_primary)
          VALUES ($1, $2, $3::listing_party_role, $4)
          ON CONFLICT (listing_id, party_id, role) DO NOTHING
          `,
          [listingId, p.partyId, p.role, p.isPrimary]
        );
      }

      await client.query("COMMIT");
      return res.status(201).json({ id: listingId });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    console.error("OFFERS_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
