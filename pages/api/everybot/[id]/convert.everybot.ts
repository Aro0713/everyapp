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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ctx = await requireOfficeContext(req, res);
  if (!ctx) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Invalid id" });

  try {
    await pool.query("begin");

    const exR = await pool.query(
      `select * from external_listings where office_id = $1 and id = $2 for update`,
      [ctx.officeId, id]
    );
    const external = exR.rows?.[0];
    if (!external) {
      await pool.query("rollback");
      return res.status(404).json({ error: "Not found" });
    }

    if (external.converted_listing_id) {
      await pool.query("commit");
      return res
        .status(200)
        .json({ ok: true, listingId: external.converted_listing_id, already: true });
    }

    const thumbR = await pool.query(
      `
      select thumb
      from external_listing_images
      where office_id = $1 and external_listing_id = $2
      order by created_at asc
      limit 1
      `,
      [ctx.officeId, id]
    );
    const thumb = thumbR.rows?.[0]?.thumb ?? null;

    const insR = await pool.query(
      `
      insert into listings (
        office_id,
        created_by,
        title,
        price,
        area_m2,
        address,
        city,
        lat,
        lng,
        source,
        source_external_id,
        status,
        created_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'everybot',$10,'draft',now()
      )
      returning id
      `,
      [
        ctx.officeId,
        ctx.userId,
        external.title ?? "Oferta z EveryBOT",
        external.price ?? null,
        external.area_m2 ?? external.area ?? null,
        external.address ?? null,
        external.city ?? null,
        external.lat ?? null,
        external.lng ?? null,
        external.id,
      ]
    );
    const listingId = insR.rows?.[0]?.id as string;

    if (thumb) {
      await pool.query(
        `
        insert into listing_images (office_id, listing_id, kind, thumb, created_at)
        values ($1,$2,'thumb',$3,now())
        `,
        [ctx.officeId, listingId, thumb]
      );
    }

    await pool.query(
      `
      update external_listings
      set status = 'converted',
          converted_listing_id = $3,
          shortlisted = false
      where office_id = $1 and id = $2
      `,
      [ctx.officeId, id, listingId]
    );

    await pool.query(
      `
      insert into external_listing_actions(office_id, external_listing_id, user_id, action, payload)
      values ($1,$2,$3,'convert', jsonb_build_object('listingId',$4))
      `,
      [ctx.officeId, id, ctx.userId, listingId]
    );

    await pool.query("commit");
    return res.status(200).json({ ok: true, listingId });
  } catch (e) {
    await pool.query("rollback");
    console.error(e);
    return res.status(500).json({ error: "Convert failed" });
  }
}
