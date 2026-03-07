// pages/api/external_listings/reveal-phone.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";
import { revealOtodomPhone } from "../../../crawler/src/lib/reveal-otodom-phone";

type RevealResult = {
  phone: string | null;
  sourceUrl: string;
};

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isUuid(s: string | null): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Tu podłączysz swój właściwy crawler Playwright.
 * Na ten moment zakładam, że masz już działający lokalnie mechanizm
 * i przeniesiesz jego logikę do funkcji serwerowej/importu.
 */
async function revealPhoneFromSourceUrl(sourceUrl: string): Promise<RevealResult> {
  if (/otodom\.pl/i.test(sourceUrl)) {
    const phone = await revealOtodomPhone(sourceUrl);
    return { phone, sourceUrl };
  }

  throw new Error(`Unsupported source for reveal-phone: ${sourceUrl}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const externalListingId = optString(req.body?.external_listing_id);
    if (!isUuid(externalListingId)) {
      return res.status(400).json({ error: "INVALID_EXTERNAL_LISTING_ID" });
    }

    const found = await pool.query<{
      id: string;
      office_id: string | null;
      source: string;
      source_url: string;
      owner_phone: string | null;
    }>(
      `
      SELECT
        id,
        office_id,
        source,
        source_url,
        owner_phone
      FROM external_listings
      WHERE id = $1::uuid
      LIMIT 1
      `,
      [externalListingId]
    );

    const row = found.rows[0];
    if (!row) {
      return res.status(404).json({ error: "LISTING_NOT_FOUND" });
    }

    // jeśli numer już jest w bazie, nie rób ponownego crawla
    if (row.owner_phone && row.owner_phone.trim()) {
      return res.status(200).json({
        ok: true,
        cached: true,
        phone: row.owner_phone.trim(),
        source: row.source,
        sourceUrl: row.source_url,
      });
    }

    const revealed = await revealPhoneFromSourceUrl(row.source_url);

    const normalizedPhone =
      typeof revealed.phone === "string" && revealed.phone.trim()
        ? revealed.phone.trim()
        : null;

    await pool.query(
      `
      UPDATE external_listings
      SET
        owner_phone = $2::text,
        updated_at = NOW()
      WHERE id = $1::uuid
      `,
      [externalListingId, normalizedPhone]
    );

    return res.status(200).json({
      ok: true,
      cached: false,
      phone: normalizedPhone,
      source: row.source,
      sourceUrl: row.source_url,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_REVEAL_PHONE_ERROR", e);
    return res.status(500).json({
      error: e?.message ?? "Reveal phone failed",
    });
  }
}