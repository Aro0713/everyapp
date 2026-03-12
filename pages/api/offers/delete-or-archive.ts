import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type Mode = "delete" | "archive";

function getMode(v: unknown): Mode | null {
  return v === "delete" || v === "archive" ? v : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const listingId =
      typeof req.body?.listingId === "string" ? req.body.listingId.trim() : "";
    const mode = getMode(req.body?.mode);

    if (!listingId) return res.status(400).json({ error: "Missing listingId" });
    if (!mode) return res.status(400).json({ error: "Invalid mode" });

    await client.query("BEGIN");

    const listingQ = await client.query(
      `
      SELECT *
      FROM public.listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    const listing = listingQ.rows[0];
    if (!listing) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "LISTING_NOT_FOUND" });
    }

    if (mode === "archive") {
      const archiveQ = await client.query(
        `
        INSERT INTO public.listing_archives (
          original_listing_id,
          office_id,
          archived_by_user_id,
          archived_at,

          record_type,
          transaction_type,
          status,

          created_by_user_id,
          case_owner_user_id,

          contract_type,
          market,
          internal_notes,

          currency,
          price_amount,
          budget_min,
          budget_max,

          area_min_m2,
          area_max_m2,
          rooms_min,
          rooms_max,

          location_text,

          title,
          description,
          property_type,
          area_m2,
          rooms,
          floor,
          year_built,

          voivodeship,
          city,
          district,
          street,
          postal_code,

          lat,
          lng,

          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, now(),
          $4, $5, $6,
          $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20,
          $21, $22, $23, $24, $25, $26, $27,
          $28, $29, $30, $31, $32,
          $33, $34,
          $35, $36
        )
        RETURNING id
        `,
        [
          listing.id,
          listing.office_id,
          userId,

          listing.record_type,
          listing.transaction_type,
          listing.status,

          listing.created_by_user_id,
          listing.case_owner_user_id,

          listing.contract_type,
          listing.market,
          listing.internal_notes,

          listing.currency,
          listing.price_amount,
          listing.budget_min,
          listing.budget_max,

          listing.area_min_m2,
          listing.area_max_m2,
          listing.rooms_min,
          listing.rooms_max,

          listing.location_text,

          listing.title,
          listing.description,
          listing.property_type,
          listing.area_m2,
          listing.rooms,
          listing.floor,
          listing.year_built,

          listing.voivodeship,
          listing.city,
          listing.district,
          listing.street,
          listing.postal_code,

          listing.lat,
          listing.lng,

          listing.created_at,
          listing.updated_at,
        ]
      );

      const archiveId = archiveQ.rows[0]?.id as string | undefined;
      if (!archiveId) throw new Error("ARCHIVE_INSERT_FAILED");

      const imagesQ = await client.query(
        `
        SELECT *
        FROM public.listing_images
        WHERE listing_id = $1
        ORDER BY sort_order ASC, created_at ASC
        `,
        [listingId]
      );

      for (const img of imagesQ.rows) {
        await client.query(
          `
          INSERT INTO public.listing_archive_images (
            archive_id,
            original_image_id,
            url,
            sort_order,
            created_at
          )
          VALUES ($1, $2, $3, $4, COALESCE($5, now()))
          `,
          [archiveId, img.id, img.url, img.sort_order ?? 0, img.created_at ?? null]
        );
      }

         const actionsQ = await client.query(
        `
        SELECT *
        FROM public.external_listing_actions
        WHERE office_id = $1
          AND (
            payload->>'listing_id' = $2
            OR note ILIKE $3
          )
        ORDER BY created_at ASC
        `,
        [officeId, listingId, `%listing:${listingId}%`]
      );

      for (const act of actionsQ.rows) {
        await client.query(
          `
          INSERT INTO public.listing_archive_actions (
            archive_id,
            original_action_id,
            office_id,
            user_id,
            action,
            payload,
            note,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()), COALESCE($9, now()))
          `,
          [
            archiveId,
            act.id,
            act.office_id,
            act.user_id,
            act.action,
                        {
              ...(act.payload ?? {}),
              archived_from_listing_id: listingId,
            },
            act.note,
            act.created_at ?? null,
            act.updated_at ?? null,
          ]
        );
      }
    }

    await client.query(`DELETE FROM public.listing_images WHERE listing_id = $1`, [listingId]);
    await client.query(`DELETE FROM public.listing_parties WHERE listing_id = $1`, [listingId]);
    await client.query(`DELETE FROM public.listings WHERE id = $1 AND office_id = $2`, [listingId, officeId]);

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, mode });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("OFFERS_DELETE_OR_ARCHIVE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}