import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = String(req.query.q ?? "").trim();

  // minimalna długość żeby nie dało się enumerować wszystkiego jednym kliknięciem
  if (q.length < 2) return res.status(200).json({ offices: [] });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT id, name, office_type, parent_office_id
      FROM offices
      WHERE name ILIKE $1
      ORDER BY name ASC
      LIMIT 20
      `,
      [`%${q}%`]
    );

    return res.status(200).json({ offices: rows });
  } catch (e: any) {
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}
