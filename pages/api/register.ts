import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

type RegisterMode = "create_office" | "join_office";

type RegisterBody = {
  email: string;
  fullName?: string;
  phone?: string;

  mode: RegisterMode;

  // mode=create_office
  officeName?: string;

  // mode=join_office
  inviteCode?: string;
  officeId?: string;
};

// --- utils: slugify + invite code generator (ING-style) ---
function slugifyBase(input: string, maxLen = 8) {
  const ascii = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");

  const cleaned = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  const base = cleaned.slice(0, maxLen);
  return base || "office";
}

function random4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

async function generateInviteCode(client: any, officeName: string) {
  const base = slugifyBase(officeName, 8);

  for (let i = 0; i < 25; i++) {
    const code = `${base}${random4()}`.toUpperCase();
    const exists = await client.query(`SELECT 1 FROM offices WHERE invite_code = $1 LIMIT 1`, [code]);
    if (exists.rowCount === 0) return code;
  }

  // fallback: 6 cyfr jeśli pechowo kolizje
  return `${base}${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`.toUpperCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as Partial<RegisterBody>;

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.fullName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const mode = body.mode;

  if (!email || !email.includes("@")) return res.status(400).json({ error: "INVALID_EMAIL" });
  if (mode !== "create_office" && mode !== "join_office") {
    return res.status(400).json({ error: "INVALID_MODE" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) auth_user_id placeholder (docelowo z Auth providera)
    const authUserId = `local:${email}`;

    // 2) upsert user
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

    // 3) mode handling
    if (mode === "create_office") {
      const officeName = (body.officeName ?? "").trim();
      if (!officeName) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "MISSING_OFFICE_NAME" });
      }

      const inviteCode = await generateInviteCode(client, officeName);

      // create office (main) - safe on conflict
      const officeRes = await client.query(
        `
        INSERT INTO offices (name, invite_code, office_type, parent_office_id)
        VALUES ($1, $2, 'main', NULL)
        ON CONFLICT (invite_code) DO NOTHING
        RETURNING id, invite_code
        `,
        [officeName, inviteCode]
      );

      if (officeRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "INVITE_CODE_CONFLICT" });
      }

      const officeId = officeRes.rows[0].id as string;

      // creator becomes OWNER + ACTIVE
      await client.query(
        `
        INSERT INTO memberships (user_id, office_id, role, status)
        VALUES ($1, $2, 'owner', 'active')
        ON CONFLICT (user_id, office_id) DO UPDATE
          SET role = 'owner',
              status = 'active'
        `,
        [userId, officeId]
      );

      await client.query("COMMIT");
      return res.status(200).json({
        ok: true,
        mode,
        officeId,
        inviteCode,
        status: "active",
        role: "owner",
      });
    }

    // mode === join_office
    const inviteCode = (body.inviteCode ?? "").trim();
    const officeIdInput = (body.officeId ?? "").trim();

    if (!inviteCode && !officeIdInput) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "MISSING_OFFICE_TARGET" });
    }

    // find office by id OR invite_code
    const officeRes = await client.query(
      `
      SELECT id
      FROM offices
      WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
         OR ($2::text IS NOT NULL AND invite_code = $2::text)
      LIMIT 1
      `,
      [officeIdInput || null, inviteCode || null]
    );

    if (officeRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: inviteCode ? "INVALID_INVITE_CODE" : "OFFICE_NOT_FOUND" });
    }

    const officeId = officeRes.rows[0].id as string;

    // membership pending (requires approval)
    await client.query(
      `
      INSERT INTO memberships (user_id, office_id, role, status)
      VALUES ($1, $2, 'agent', 'pending')
      ON CONFLICT (user_id, office_id) DO NOTHING
      `,
      [userId, officeId]
    );

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, mode, status: "pending", officeId });
  } catch (e: any) {
    console.error("REGISTER_API_ERROR", e);
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}
