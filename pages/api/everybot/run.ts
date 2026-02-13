// pages/api/everybot/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function getBaseUrl(req: NextApiRequest) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers.host as string) ||
    "localhost:3000";
  return `${proto}://${host}`;
}

async function callInternal(req: NextApiRequest, path: string, body: any) {
  const base = getBaseUrl(req);
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.cookie || "",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `${path} HTTP ${r.status}`);
  return j;
}

async function tryAcquireOfficeLock(officeId: string): Promise<boolean> {
  const k = `everybot_run:${officeId}`;
  const { rows } = await pool.query<{ ok: boolean }>(
    `select pg_try_advisory_lock(hashtext($1)) as ok`,
    [k]
  );
  return rows?.[0]?.ok === true;
}

async function releaseOfficeLock(officeId: string): Promise<void> {
  const k = `everybot_run:${officeId}`;
  await pool.query(`select pg_advisory_unlock(hashtext($1))`, [k]).catch(() => null);
}

type IncomingFilters = {
  q?: unknown;
  source?: unknown;
  transactionType?: unknown;
  propertyType?: unknown;
  locationText?: unknown;
  city?: unknown;
  district?: unknown;
  minPrice?: unknown;
  maxPrice?: unknown;
  minArea?: unknown;
  maxArea?: unknown;
  rooms?: unknown;
};

function pickString(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
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

    // ✅ jeden lock, jeden check
    const gotLock = await tryAcquireOfficeLock(officeId);
    if (!gotLock) {
      return res.status(409).json({ error: "EVERYBOT_ALREADY_RUNNING" });
    }

    try {
      const body = req.body ?? {};

      // ✅ NOWY KONTRAKT: body.filters
      const filters = (body.filters ?? null) as IncomingFilters | null;

      // ✅ kompatybilność wstecz: body.q/body.source
      const qFromFilters = filters ? pickString(filters.q, "") : "";
      const sourceFromFilters = filters ? pickString(filters.source, "all") : "all";

      const q =
        qFromFilters ||
        (typeof body.q === "string" ? body.q : "");

      const source =
        sourceFromFilters ||
        (typeof body.source === "string" ? body.source : "all");

      const cursor =
        typeof body.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : "1";

      const harvestPages = 5;
      const harvestLimit = 50;

      // ✅ tylko whitelisted źródła dla run (all => otodom+olx)
      const sourcesToRun = source === "all" ? ["otodom", "olx"] : [source];

      let harvestedTotal = 0;
      const harvestBySource: Record<string, any> = {};
      const nextCursorBySource: Record<string, string | null> = {};

      for (const src of sourcesToRun) {
        try {
          // IMPORTANT: search endpoint nadal dostaje q/source/cursor/limit/pages
          // (filtry szczegółowe działają na DB w /external_listings/list)
         const j1 = await callInternal(req, "/api/everybot/search", {
          // nowy kontrakt
          filters: filters ?? { q, source: src },
          // kompatybilność
          q,
          source: src,
          cursor,
          limit: harvestLimit,
          pages: harvestPages,
        });

        harvestBySource[src] = j1;
          nextCursorBySource[src] =
            typeof j1?.nextCursor === "string" ? j1.nextCursor : null;

          harvestedTotal += Number(j1?.upserted ?? 0) || 0;
        } catch (e: any) {
          harvestBySource[src] = { error: e?.message ?? String(e) };
          nextCursorBySource[src] = null;
        }
      }

      let enrichTotal = 0;
      for (let i = 0; i < 6; i++) {
        const j2 = await callInternal(req, "/api/everybot/enrich", { limit: 50 });
        const processed = Number(j2?.processed ?? 0);
        if (!Number.isFinite(processed) || processed <= 0) break;
        enrichTotal += processed;
      }

      let verifyTotal = 0;
      for (let i = 0; i < 2; i++) {
        const j3 = await callInternal(req, "/api/everybot/verify", { limit: 100 });
        const processed = Number(j3?.processed ?? 0);
        if (!Number.isFinite(processed) || processed <= 0) break;
        verifyTotal += processed;
      }

      return res.status(200).json({
        ok: true,
        officeId,
        harvestedTotal,
        harvestBySource,
        nextCursorBySource,
        enrichTotal,
        verifyTotal,
        config: {
          // zwracamy oba: finalne q/source oraz pełny filtr (dla debug)
          q,
          source,
          cursor,
          harvestPages,
          harvestLimit,
          filters: filters ?? null,
        },
      });
    } finally {
      await releaseOfficeLock(officeId);
    }
  } catch (e: any) {
    console.error("EVERYBOT_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
