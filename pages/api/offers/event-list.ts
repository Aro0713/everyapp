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
    const { id } = req.query;

    const rows = await client.query(
      `
      SELECT *
      FROM public.listing_events
      WHERE listing_id = $1
        AND office_id = $2
      ORDER BY event_date DESC
      `,
      [id, officeId]
    );

    return res.status(200).json({ ok: true, rows: rows.rows });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
}