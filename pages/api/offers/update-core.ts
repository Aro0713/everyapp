import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optNumeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const listingId = optString(req.body?.id);

    if (!listingId) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const existingRes = await client.query(
      `
      SELECT *
      FROM public.listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const payload = {
      title: optString(req.body?.title),
      description: optString(req.body?.description),
      locationText: optString(req.body?.locationText),
      propertyType: optString(req.body?.propertyType),
      market: optString(req.body?.market),
      contractType: optString(req.body?.contractType),
      currency: optString(req.body?.currency),
      priceAmount: optNumeric(req.body?.priceAmount),
      areaM2: optNumeric(req.body?.areaM2),
      rooms: optNumeric(req.body?.rooms),
      floor: optString(req.body?.floor),
      yearBuilt: optString(req.body?.yearBuilt),
      voivodeship: optString(req.body?.voivodeship),
      city: optString(req.body?.city),
      district: optString(req.body?.district),
      street: optString(req.body?.street),
      postalCode: optString(req.body?.postalCode),
      internalNotes: optString(req.body?.internalNotes),
    };

    await client.query("BEGIN");

    await client.query(
      `
      UPDATE public.listings
      SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        location_text = COALESCE($5, location_text),
        property_type = COALESCE($6, property_type),
        market = COALESCE($7, market),
        contract_type = COALESCE($8, contract_type),
        currency = COALESCE($9, currency),
        price_amount = COALESCE($10, price_amount),
        area_m2 = COALESCE($11, area_m2),
        rooms = COALESCE($12, rooms),
        floor = COALESCE($13, floor),
        year_built = COALESCE($14, year_built),
        voivodeship = COALESCE($15, voivodeship),
        city = COALESCE($16, city),
        district = COALESCE($17, district),
        street = COALESCE($18, street),
        postal_code = COALESCE($19, postal_code),
        internal_notes = COALESCE($20, internal_notes),
        updated_at = now()
      WHERE id = $1
        AND office_id = $2
      `,
      [
        listingId,
        officeId,
        payload.title,
        payload.description,
        payload.locationText,
        payload.propertyType,
        payload.market,
        payload.contractType,
        payload.currency,
        payload.priceAmount,
        payload.areaM2,
        payload.rooms,
        payload.floor,
        payload.yearBuilt,
        payload.voivodeship,
        payload.city,
        payload.district,
        payload.street,
        payload.postalCode,
        payload.internalNotes,
      ]
    );

    const changedFields: Array<{ label: string; oldValue: string | null; newValue: string | null }> = [];

    const compare = (label: string, oldValue: unknown, newValue: unknown) => {
      const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
      const newStr = newValue === null || newValue === undefined ? null : String(newValue);
      if (newStr !== null && oldStr !== newStr) {
        changedFields.push({ label, oldValue: oldStr, newValue: newStr });
      }
    };

    compare("Tytuł", existing.title, payload.title);
    compare("Opis", existing.description, payload.description);
    compare("Lokalizacja", existing.location_text, payload.locationText);
    compare("Typ nieruchomości", existing.property_type, payload.propertyType);
    compare("Rynek", existing.market, payload.market);
    compare("Rodzaj umowy", existing.contract_type, payload.contractType);
    compare("Waluta", existing.currency, payload.currency);
    compare("Cena", existing.price_amount, payload.priceAmount);
    compare("Powierzchnia", existing.area_m2, payload.areaM2);
    compare("Pokoje", existing.rooms, payload.rooms);
    compare("Piętro", existing.floor, payload.floor);
    compare("Rok budowy", existing.year_built, payload.yearBuilt);
    compare("Województwo", existing.voivodeship, payload.voivodeship);
    compare("Miasto", existing.city, payload.city);
    compare("Dzielnica", existing.district, payload.district);
    compare("Ulica", existing.street, payload.street);
    compare("Kod pocztowy", existing.postal_code, payload.postalCode);
    compare("Notatki oferty", existing.internal_notes, payload.internalNotes);

    for (const item of changedFields) {
      await client.query(
        `
        INSERT INTO public.listing_history (
          office_id,
          listing_id,
          event_type,
          event_label,
          old_value,
          new_value,
          note,
          created_by_user_id
        )
        VALUES ($1, $2, 'field_update', $3, $4, $5, NULL, $6)
        `,
        [officeId, listingId, item.label, item.oldValue, item.newValue, userId]
      );
    }

    const refreshed = await client.query(
      `
      SELECT *
      FROM public.listings
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [listingId, officeId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      row: refreshed.rows[0] ?? null,
      changedFieldsCount: changedFields.length,
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_UPDATE_CORE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}