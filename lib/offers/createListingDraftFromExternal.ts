import { pool } from "../neonDb";

type CreateDraftInput = {
  externalListingId: string;
  officeId: string;
  userId: string;
};

export async function createListingDraftFromExternal({
  externalListingId,
  officeId,
  userId,
}: CreateDraftInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ext = await client.query(
      `
      SELECT
        id,
        price_amount,
        currency,
        location_text,
        transaction_type
      FROM external_listings
      WHERE id = $1
      LIMIT 1
      `,
      [externalListingId]
    );

    const row = ext.rows[0];
    if (!row) {
      throw new Error("EXTERNAL_LISTING_NOT_FOUND");
    }

    const existing = await client.query(
      `
      SELECT converted_listing_id
      FROM external_listings
      WHERE id = $1
      LIMIT 1
      `,
      [externalListingId]
    );

    const converted = existing.rows[0]?.converted_listing_id ?? null;

    if (converted) {
      await client.query("COMMIT");
      return { listingId: converted };
    }

    const ins = await client.query(
      `
      INSERT INTO listings (
        office_id,
        record_type,
        transaction_type,
        status,
        created_by_user_id,
        case_owner_user_id,
        currency,
        price_amount,
        location_text
      )
      VALUES (
        $1,
        'offer',
        $2,
        'draft',
        $3,
        $3,
        $4,
        $5,
        $6
      )
      RETURNING id
      `,
      [
        officeId,
        row.transaction_type ?? "sale",
        userId,
        row.currency ?? "PLN",
        row.price_amount ?? null,
        row.location_text ?? null,
      ]
    );

    const listingId = ins.rows[0].id;

    await client.query(
      `
      UPDATE external_listings
      SET converted_listing_id = $2
      WHERE id = $1
      `,
      [externalListingId, listingId]
    );

    await client.query("COMMIT");

    return { listingId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw e;
  } finally {
    client.release();
  }
}