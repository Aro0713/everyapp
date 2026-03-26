import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) throw new Error("UNAUTHORIZED");

    const officeId = await getOfficeIdForUserId(userId);

    const { listingId, type, note } = req.body;

    const event = await client.query(
      `
      INSERT INTO public.listing_events (
        office_id,
        listing_id,
        event_type,
        title,
        note,
        event_date,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $3, $4, now(), $5)
      RETURNING *
      `,
      [officeId, listingId, type, note, userId]
    );

    // wpis do historii
    await client.query(
      `
      INSERT INTO public.listing_history (
        office_id,
        listing_id,
        event_type,
        event_label,
        note,
        created_by_user_id
      )
      VALUES ($1, $2, 'event', $3, $4, $5)
      `,
      [officeId, listingId, type, note, userId]
    );

    return res.status(200).json({ ok: true, row: event.rows[0] });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
}