import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "").trim();

  if (!email || !email.includes("@")) return res.status(400).json({ error: "INVALID_EMAIL" });
  if (password.length < 8) return res.status(400).json({ error: "WEAK_PASSWORD" });

  const client = await pool.connect();
  try {
    const r = await client.query(
      `select id, password_hash from users where email = $1 limit 1`,
      [email]
    );

    if (r.rowCount === 0) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const userId = r.rows[0].id as string;
    const hash = r.rows[0].password_hash as string;

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    res.setHeader("Set-Cookie", setSessionCookie(userId));
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("LOGIN_API_ERROR", e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  } finally {
    client.release();
  }
}
