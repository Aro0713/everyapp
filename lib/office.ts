import { pool } from "./neonDb";

export async function getOfficeIdForUserId(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `
    SELECT office_id
    FROM memberships
    WHERE user_id = $1
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );

  const officeId = rows[0]?.office_id ?? null;
  if (!officeId) throw new Error("NO_OFFICE_MEMBERSHIP");
  return officeId;
}
