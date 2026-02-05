import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/session";

async function requireOfficeContext(req: NextApiRequest, res: NextApiResponse) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  // MVP: “aktywny office” = pierwszy membership
  const m = await pool.query(
    `select office_id from memberships where user_id = $1 order by created_at asc limit 1`,
    [userId]
  );

  const officeId = m.rows?.[0]?.office_id as string | undefined;
  if (!officeId) {
    res.status(403).json({ error: "No office membership" });
    return null;
  }

  return { userId, officeId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ctx = await requireOfficeContext(req, res);
  if (!ctx) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const externalR = await pool.query(
    `
    select
      el.*,
      eli.thumb as thumb
    from external_listings el
    left join lateral (
      select thumb
      from external_listing_images
      where office_id = el.office_id
        and external_listing_id = el.id
      order by created_at asc
      limit 1
    ) eli on true
    where el.office_id = $1
      and el.id = $2
    `,
    [ctx.officeId, id]
  );

  const external = externalR.rows?.[0];
  if (!external) {
    return res.status(404).json({ error: "Not found" });
  }

  const notesR = await pool.query(
    `
    select id, note, created_at, updated_at, user_id
    from external_listing_notes
    where office_id = $1
      and external_listing_id = $2
    order by created_at desc
    limit 50
    `,
    [ctx.officeId, id]
  );

  const actionsR = await pool.query(
    `
    select id, action, payload, created_at, user_id
    from external_listing_actions
    where office_id = $1
      and external_listing_id = $2
    order by created_at desc
    limit 50
    `,
    [ctx.officeId, id]
  );

  return res.status(200).json({
    external,
    notes: notesR.rows ?? [],
    actions: actionsR.rows ?? [],
  });
}
