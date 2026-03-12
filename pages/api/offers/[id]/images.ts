import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../../lib/session";
import { getOfficeIdForUserId } from "../../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v.trim());
}

async function getListingForOffice(listingId: string, officeId: string) {
  const q = await pool.query(
    `
    SELECT id, office_id
    FROM public.listings
    WHERE id = $1
      AND office_id = $2
    LIMIT 1
    `,
    [listingId, officeId]
  );

  return q.rows[0] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    const listingId = typeof req.query.id === "string" ? req.query.id : null;

    if (!listingId) return res.status(400).json({ error: "Missing listing id" });

    const listing = await getListingForOffice(listingId, officeId);
    if (!listing) return res.status(404).json({ error: "LISTING_NOT_FOUND" });

    if (req.method === "GET") {
      const q = await client.query(
        `
        SELECT id, listing_id, url, sort_order, created_at
        FROM public.listing_images
        WHERE listing_id = $1
        ORDER BY sort_order ASC, created_at ASC, id ASC
        `,
        [listingId]
      );

      return res.status(200).json({ rows: q.rows });
    }

    if (req.method === "POST") {
      const url = optString(req.body?.url);
      if (!url) return res.status(400).json({ error: "Missing url" });
      if (!isHttpUrl(url)) return res.status(400).json({ error: "Invalid image URL" });

      await client.query("BEGIN");

      const maxQ = await client.query(
        `
        SELECT COALESCE(MAX(sort_order), -1) AS max_sort
        FROM public.listing_images
        WHERE listing_id = $1
        `,
        [listingId]
      );

      const nextSort = Number(maxQ.rows[0]?.max_sort ?? -1) + 1;

      const ins = await client.query(
        `
        INSERT INTO public.listing_images (
          listing_id,
          url,
          sort_order
        )
        VALUES ($1, $2, $3)
        RETURNING id, listing_id, url, sort_order, created_at
        `,
        [listingId, url, nextSort]
      );

      await client.query("COMMIT");
      return res.status(201).json({ row: ins.rows[0] });
    }

    if (req.method === "PUT") {
      const imageId = optString(req.body?.imageId);
      const direction = optString(req.body?.direction);

      if (!imageId) return res.status(400).json({ error: "Missing imageId" });
      if (direction !== "left" && direction !== "right") {
        return res.status(400).json({ error: "Invalid direction" });
      }

      await client.query("BEGIN");

      const currentQ = await client.query(
        `
        SELECT id, listing_id, sort_order
        FROM public.listing_images
        WHERE id = $1
          AND listing_id = $2
        LIMIT 1
        `,
        [imageId, listingId]
      );

      const current = currentQ.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "IMAGE_NOT_FOUND" });
      }

      const neighborQ = await client.query(
        direction === "left"
          ? `
            SELECT id, sort_order
            FROM public.listing_images
            WHERE listing_id = $1
              AND sort_order < $2
            ORDER BY sort_order DESC, created_at DESC, id DESC
            LIMIT 1
          `
          : `
            SELECT id, sort_order
            FROM public.listing_images
            WHERE listing_id = $1
              AND sort_order > $2
            ORDER BY sort_order ASC, created_at ASC, id ASC
            LIMIT 1
          `,
        [listingId, current.sort_order]
      );

      const neighbor = neighborQ.rows[0];
      if (!neighbor) {
        await client.query("COMMIT");
        return res.status(200).json({ ok: true, unchanged: true });
      }

      await client.query(
        `
        UPDATE public.listing_images
        SET sort_order = $2
        WHERE id = $1
        `,
        [current.id, neighbor.sort_order]
      );

      await client.query(
        `
        UPDATE public.listing_images
        SET sort_order = $2
        WHERE id = $1
        `,
        [neighbor.id, current.sort_order]
      );

      await client.query("COMMIT");
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const imageId =
        typeof req.query.imageId === "string" ? req.query.imageId.trim() : "";

      if (!imageId) return res.status(400).json({ error: "Missing imageId" });

      await client.query("BEGIN");

      const del = await client.query(
        `
        DELETE FROM public.listing_images
        WHERE id = $1
          AND listing_id = $2
        RETURNING id
        `,
        [imageId, listingId]
      );

      if (!del.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "IMAGE_NOT_FOUND" });
      }

      const rowsQ = await client.query(
        `
        SELECT id
        FROM public.listing_images
        WHERE listing_id = $1
        ORDER BY sort_order ASC, created_at ASC, id ASC
        `,
        [listingId]
      );

      for (let i = 0; i < rowsQ.rows.length; i++) {
        await client.query(
          `
          UPDATE public.listing_images
          SET sort_order = $2
          WHERE id = $1
          `,
          [rowsQ.rows[i].id, i]
        );
      }

      await client.query("COMMIT");
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("OFFER_IMAGES_API_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}