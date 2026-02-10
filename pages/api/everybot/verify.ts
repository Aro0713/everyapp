// pages/api/everybot/verify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

type VerifyStatus = "active" | "inactive" | "removed" | "unknown";

type ExternalListingRow = {
  id: string;
  office_id: string;
  source: string;
  source_url: string;
};

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function detectSource(url: string): "otodom" | "olx" | "no" | "gratka" | "morizon" | "owner" | "other" {
  const u = url.toLowerCase();
  if (u.includes("otodom.")) return "otodom";
  if (u.includes("olx.")) return "olx";
  if (u.includes("nieruchomosci-online.")) return "no";
  if (u.includes("gratka.")) return "gratka";
  if (u.includes("morizon.")) return "morizon";
  return "other";
}

function statusFromResponse(r: Response, html: string, source: ReturnType<typeof detectSource>): VerifyStatus {
  // twarde usunięcie
  if (r.status === 404 || r.status === 410) return "removed";
  if (r.status >= 500) return "unknown";

  const text = (html || "").toLowerCase();

  // uniwersalne frazy
  if (text.includes("ogłoszenie nieaktualne") || text.includes("ogloszenie nieaktualne")) return "inactive";
  if (text.includes("oferta nieaktualna")) return "inactive";
  if (text.includes("nie znaleziono") || text.includes("not found")) return "removed";

  // źródła – lekkie heurystyki
  if (source === "otodom") {
    if (text.includes("oferta została zakończona") || text.includes("oferta zostala zakonczona")) return "inactive";
  }
  if (source === "olx") {
    if (text.includes("to ogłoszenie nie jest już dostępne") || text.includes("to ogloszenie nie jest juz dostepne"))
      return "inactive";
  }

  return "active";
}

async function fetchHtmlForVerify(url: string): Promise<{ html: string; status: number; finalUrl: string }> {
  const r = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  });

  const html = await r.text().catch(() => "");
  return { html, status: r.status, finalUrl: r.url };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "POST, GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
    const officeId = await getOfficeIdForUserId(userId);

    if (req.method === "GET") {
      return res.status(200).json({ ok: true, officeId });
    }

    const body = req.body ?? {};
    const limitRaw = optNumber(body.limit) ?? 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const onlyId = optString(body.id);
    const onlyUrl = optString(body.url);

    const { rows } = await pool.query<ExternalListingRow>(
      onlyId
        ? `
          SELECT id, office_id, source, source_url
          FROM external_listings
          WHERE office_id = $1 AND id = $2
          LIMIT 1
        `
        : onlyUrl
        ? `
          SELECT id, office_id, source, source_url
          FROM external_listings
          WHERE office_id = $1 AND source_url = $2
          ORDER BY updated_at DESC
          LIMIT 1
        `
        : `
          SELECT id, office_id, source, source_url
          FROM external_listings
          WHERE office_id = $1
            AND COALESCE(source_status, 'unknown') <> 'removed'
          ORDER BY last_checked_at ASC NULLS FIRST, updated_at DESC
          LIMIT $2
        `,
      onlyId || onlyUrl ? [officeId, (onlyId ?? onlyUrl)!] : [officeId, limit]
    );

    if (!rows.length) {
      return res.status(200).json({ ok: true, processed: 0, message: "Nothing to verify" });
    }

    let processed = 0;
    const results: Array<{ id: string; url: string; status: VerifyStatus; finalUrl?: string; httpStatus?: number }> = [];
    const errors: Array<{ id: string; url: string; error: string }> = [];

    for (const row of rows) {
      try {
        const src = detectSource(row.source_url);
        if (src === "other") {
          // "owner" / inne – traktujemy jako unknown (albo active, jeśli chcesz)
          await pool.query(
            `
            UPDATE external_listings
            SET
              source_status = COALESCE(source_status, 'unknown'),
              last_checked_at = now(),
              updated_at = now()
            WHERE office_id = $1 AND id = $2
          `,
            [officeId, row.id]
          );

          processed += 1;
          results.push({ id: row.id, url: row.source_url, status: "unknown" });
          continue;
        }

        const { html, status, finalUrl } = await fetchHtmlForVerify(row.source_url);
        const s = statusFromResponse({ status } as any, html, src);

        // redirect? -> zapisz nowy url
        const final = finalUrl && finalUrl !== row.source_url ? finalUrl : null;

        await pool.query(
          `
          UPDATE external_listings
          SET
            source_status = $1,
            last_checked_at = now(),
            updated_at = now(),
            source_url = COALESCE($2, source_url)
          WHERE office_id = $3 AND id = $4
        `,
          [s, final, officeId, row.id]
        );

        processed += 1;
        results.push({ id: row.id, url: row.source_url, status: s, finalUrl: final ?? undefined, httpStatus: status });
      } catch (e: any) {
        errors.push({ id: row.id, url: row.source_url, error: e?.message ?? "Verify failed" });
      }
    }

    return res.status(200).json({
      ok: true,
      officeId,
      requested: limit,
      processed,
      results,
      errors,
    });
  } catch (e: any) {
    console.error("EVERYBOT_VERIFY_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
