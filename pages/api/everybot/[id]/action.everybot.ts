import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/session";

async function requireOfficeContext(req: NextApiRequest, res: NextApiResponse) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ctx = await requireOfficeContext(req, res);
  if (!ctx) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const body = req.body as any;
  if (!body?.type) return res.status(400).json({ error: "Missing type" });

  const exists = await pool.query(
    `select id from external_listings where office_id = $1 and id = $2`,
    [ctx.officeId, id]
  );
  if (!exists.rows?.[0]) return res.status(404).json({ error: "Not found" });

  if (body.type === "shortlist") {
    const value = !!body.value;
    await pool.query(
      `
      update external_listings
      set shortlisted = $3,
          status = case when $3 then 'shortlisted' else status end
      where office_id = $1 and id = $2
      `,
      [ctx.officeId, id, value]
    );

    await pool.query(
      `
      insert into external_listing_actions(office_id, external_listing_id, user_id, action, payload)
      values ($1,$2,$3,'shortlist', jsonb_build_object('value',$4))
      `,
      [ctx.officeId, id, ctx.userId, value]
    );
  }

  if (body.type === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Missing reject reason" });

    await pool.query(
      `
      update external_listings
      set status = 'rejected',
          rejected_reason = $3,
          rejected_meta = coalesce($4::jsonb,'{}'::jsonb),
          shortlisted = false
      where office_id = $1 and id = $2
      `,
      [ctx.officeId, id, reason, body.meta ? JSON.stringify(body.meta) : null]
    );

    await pool.query(
      `
      insert into external_listing_actions(office_id, external_listing_id, user_id, action, payload)
      values ($1,$2,$3,'reject', jsonb_build_object('reason',$4,'meta',coalesce($5::jsonb,'{}'::jsonb)))
      `,
      [ctx.officeId, id, ctx.userId, reason, body.meta ? JSON.stringify(body.meta) : null]
    );
  }

  if (body.type === "unreject") {
    await pool.query(
      `
      update external_listings
      set status = 'new',
          rejected_reason = null,
          rejected_meta = null
      where office_id = $1 and id = $2
      `,
      [ctx.officeId, id]
    );

    await pool.query(
      `
      insert into external_listing_actions(office_id, external_listing_id, user_id, action, payload)
      values ($1,$2,$3,'unreject','{}'::jsonb)
      `,
      [ctx.officeId, id, ctx.userId]
    );
  }

  if (body.type === "note") {
    const note = String(body.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "Missing note" });

    await pool.query(
      `
      insert into external_listing_notes(office_id, external_listing_id, user_id, note)
      values ($1,$2,$3,$4)
      `,
      [ctx.officeId, id, ctx.userId, note]
    );

    await pool.query(
      `
      insert into external_listing_actions(office_id, external_listing_id, user_id, action, payload)
      values ($1,$2,$3,'note', jsonb_build_object('len',$4))
      `,
      [ctx.officeId, id, ctx.userId, note.length]
    );
  }

  const externalR = await pool.query(
    `select * from external_listings where office_id = $1 and id = $2`,
    [ctx.officeId, id]
  );

  return res.status(200).json({ ok: true, external: externalR.rows?.[0] ?? null });
}
