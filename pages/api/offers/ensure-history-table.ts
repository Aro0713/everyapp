import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.listing_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        office_id uuid NOT NULL,
        listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        event_label text NOT NULL,
        old_value text NULL,
        new_value text NULL,
        note text NULL,
        created_by_user_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listing_history_listing_id_created_at
      ON public.listing_history(listing_id, created_at DESC)
    `);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("OFFERS_ENSURE_HISTORY_TABLE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}