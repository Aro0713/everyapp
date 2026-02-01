import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const { rows } = await pool.query(
      `SELECT key, category FROM permissions ORDER BY category ASC, key ASC`
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error("PERMISSIONS_LIST_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
