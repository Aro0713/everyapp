import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const listingId = mustString(req.body?.listingId, "listingId");
    const finalPrice = optNumber(req.body?.finalPrice);
    const note = typeof req.body?.note === "string" ? req.body.note : null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Sprawdzenie czy listing istnieje
      const listingRes = await client.query(
        `SELECT id, status FROM listings WHERE id = $1 AND office_id = $2`,
        [listingId, officeId]
      );

      if (!listingRes.rows[0]) {
        throw new Error("LISTING_NOT_FOUND");
      }

      // 2. Zmiana statusu
      await client.query(
        `
        UPDATE listings
        SET status = 'closed',
            updated_at = now()
        WHERE id = $1
        `,
        [listingId]
      );

      // 3. Historia (timeline)
      await client.query(
        `
        INSERT INTO listing_history (
          listing_id,
          created_by_user_id,
          note
        )
        VALUES ($1, $2, $3)
        `,
        [
          listingId,
          userId,
          note ?? "Zamknięcie transakcji"
        ]
      );

      // 4. Event (timeline / kalendarz / statystyki)
      await client.query(
        `
        INSERT INTO listing_events (
          listing_id,
          created_by_user_id
        )
        VALUES ($1, $2)
        `,
        [listingId, userId]
      );

      // 5. KPI / revenue (opcjonalne - zapis do historii jako value)
      if (finalPrice) {
        await client.query(
          `
          INSERT INTO listing_history (
            listing_id,
            created_by_user_id,
            note
          )
          VALUES ($1, $2, $3)
          `,
          [
            listingId,
            userId,
            `Wartość transakcji: ${finalPrice}`
          ]
        );
      }

      await client.query("COMMIT");

      return res.status(200).json({
        ok: true,
        listingId,
        status: "closed",
        finalPrice,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => null);
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("LISTING_CLOSE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}