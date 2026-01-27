import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

type RegisterBody = {
  email: string;
  fullName?: string;
  phone?: string;
  inviteCode: string;
  // auth_user_id na razie symulujemy, docelowo przyjdzie z Auth providera
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as Partial<RegisterBody>;
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.fullName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const inviteCode = (body.inviteCode ?? "").trim();

  if (!email || !email.includes("@")) return res.status(400).json({ error: "INVALID_EMAIL" });
  if (!inviteCode) return res.status(400).json({ error: "MISSING_INVITE_CODE" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) znajdź biuro po invite_code
    const officeRes = await client.query(
      `SELECT id FROM offices WHERE invite_code = $1 LIMIT 1`,
      [inviteCode]
    );
    if (officeRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "INVALID_INVITE_CODE" });
    }
    const officeId = officeRes.rows[0].id as string;

    // 2) "auth_user_id" - tymczasowo: generujemy stabilny placeholder
    // Docelowo: to będzie id z Clerk/NextAuth/Auth0
    const authUserId = `local:${email}`;

    // 3) upsert user
    const userRes = await client.query(
      `
      INSERT INTO users (auth_user_id, email, full_name, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone
      RETURNING id
      `,
      [authUserId, email, fullName || null, phone || null]
    );
    const userId = userRes.rows[0].id as string;

    // 4) membership pending (jeśli już istnieje, zostaw)
    await client.query(
      `
      INSERT INTO memberships (user_id, office_id, role, status)
      VALUES ($1, $2, 'agent', 'pending')
      ON CONFLICT (user_id, office_id) DO NOTHING
      `,
      [userId, officeId]
    );

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, status: "pending" });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}
