import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { enrichRegistry, type SourceKey } from "../../../lib/everybot/enrichers";

async function tryAcquireOfficeLock(officeId: string): Promise<boolean> {
  const k = `everybot_enrich:${officeId}`;
  const { rows } = await pool.query<{ ok: boolean }>(
    `select pg_try_advisory_lock(hashtext($1)) as ok`,
    [k]
  );
  return rows?.[0]?.ok === true;
}

async function releaseOfficeLock(officeId: string): Promise<void> {
  const k = `everybot_enrich:${officeId}`;
  await pool.query(`select pg_advisory_unlock(hashtext($1))`, [k]).catch(() => null);
}

type Row = {
  id: string;
  office_id: string;
  source: SourceKey;
  source_url: string;
};
function parseLocationPartsFromText(locationText: string | null): {
  voivodeship: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
} {
  if (!locationText) return { voivodeship: null, city: null, district: null, street: null };

  const raw = locationText.replace(/\s+/g, " ").trim();
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const n = parts.length;

  if (n === 0) return { voivodeship: null, city: null, district: null, street: null };

  const last = parts[n - 1];
  const looksLikeVoiv = /^[a-zA-Ząćęłńóśźż-]{4,}$/.test(last) && !last.toLowerCase().startsWith("ul");

  if (looksLikeVoiv && n === 2) {
    return { city: parts[0] || null, district: null, street: null, voivodeship: last || null };
  }

  if (looksLikeVoiv && n === 3) {
    return { city: parts[0] || null, district: parts[1] || null, street: null, voivodeship: last || null };
  }

  if (looksLikeVoiv && n >= 4) {
    return {
      street: parts.slice(0, n - 3).join(", ") || null,
      district: parts[n - 3] || null,
      city: parts[n - 2] || null,
      voivodeship: last || null,
    };
  }

  if (n === 1) {
    return { city: parts[0] || null, district: null, street: null, voivodeship: null };
  }

  return {
    street: n > 2 ? parts.slice(0, n - 2).join(", ") : null,
    district: parts[n - 2] || null,
    city: parts[n - 1] || null,
    voivodeship: null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
    }

    // ✅ Vercel Cron auth (bez sekretów w repo)
    const ua = String(req.headers["user-agent"] || "");
    const auth = String(req.headers["authorization"] || "");
    const secret = process.env.EVERYBOT_CRON_SECRET || "";

    // ✅ allow Vercel Cron OR Bearer secret
    const okCronUa = ua.startsWith("vercel-cron");
    const okBearer = !!secret && auth === `Bearer ${secret}`;

    if (!okCronUa && !okBearer) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const limit = 50;

    const { rows } = await pool.query<Row>(
        `
        select id, office_id, source, source_url
        from external_listings
        where enriched_at is null
        and status in ('preview','active','enriched')
        and (location_text is null or location_text = '' or city is null or voivodeship is null)
        order by updated_at asc
        limit $1
        `,
        [limit]
        );

    if (!rows.length) {
      return res.status(200).json({ ok: true, processed: 0, errors: [] });
    }

    const byOffice = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byOffice.get(r.office_id) ?? [];
      arr.push(r);
      byOffice.set(r.office_id, arr);
    }

    let processed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const [officeId, items] of byOffice.entries()) {
      const gotLock = await tryAcquireOfficeLock(officeId);
      if (!gotLock) continue;

      try {
        for (const it of items) {
          try {
            const enricher = enrichRegistry[it.source];
            if (!enricher) throw new Error(`No enricher for source=${it.source}`);

            const data = await enricher(it.source_url);
            let locationText = (data?.location_text ?? null) as string | null;

            if (it.source === "otodom" && (!locationText || !locationText.trim())) {
            const r = await fetch(it.source_url, {
                method: "GET",
                redirect: "follow",
                headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "accept": "text/html,application/xhtml+xml",
                "accept-language": "pl-PL,pl;q=0.9,en;q=0.8",
                "cache-control": "no-cache",
                "pragma": "no-cache",
                },
            });

            const html = await r.text().catch(() => "");

            // og:description / description często zawiera "Miasto, powiat/dzielnica, województwo"
            const ogDesc =
                html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ??
                null;

            const metaDesc =
                html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ??
                null;

            // heurystyka: bierz fragment po przecinku, jeśli wygląda jak "..., ..., śląskie"
            const pick = (s: string | null) => {
                if (!s) return null;
                // próbuj znaleźć końcówkę "..., ..., <woj>"
                const m = s.match(/([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9 .-]+,\s*[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9 .-]+,\s*[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{4,})/);
                return (m?.[1] ?? null)?.trim() ?? null;
            };

            locationText = pick(ogDesc) ?? pick(metaDesc) ?? null;
            }


                const loc = parseLocationPartsFromText(locationText);

            await pool.query(
            `
            update external_listings
            set
                title = coalesce($2, title),
                description = coalesce($3, description),
                price_amount = coalesce($4, price_amount),
                currency = coalesce($5, currency),
                location_text = coalesce($6, location_text),
                thumb_url = coalesce($7, thumb_url),

                area_m2 = coalesce($8, area_m2),
                rooms = coalesce($9, rooms),
                price_per_m2 = coalesce($10, price_per_m2),

                voivodeship = coalesce($11, voivodeship),
                city = coalesce($12, city),
                district = coalesce($13, district),
                street = coalesce($14, street),

                status = 'enriched',
                enriched_at = now(),
                updated_at = now()
            where id = $1
            `,
            [
                it.id,
                data?.title ?? null,
                data?.description ?? null,
                data?.price_amount ?? null,
                data?.currency ?? null,
                locationText,
                data?.thumb_url ?? null,

                data?.area_m2 ?? null,
                data?.rooms ?? null,
                data?.price_per_m2 ?? null,

                loc.voivodeship,
                loc.city,
                loc.district,
                loc.street,
            ]
            );


            processed++;
          } catch (e: any) {
            errors.push({ id: it.id, error: e?.message ?? String(e) });
            await pool
              .query(`update external_listings set status='error', updated_at=now() where id=$1`, [
                it.id,
              ])
              .catch(() => null);
          }
        }
      } finally {
        await releaseOfficeLock(officeId);
      }
    }

    return res.status(200).json({ ok: true, processed, errors });
  } catch (e: any) {
    console.error("EVERYBOT_ENRICH_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
