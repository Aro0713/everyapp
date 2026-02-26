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
  voivodeship?: unknown; // ✅ DODAJ
  city?: unknown;
  district?: unknown;
  minPrice?: unknown;
  maxPrice?: unknown;
  minArea?: unknown;
  maxArea?: unknown;
  rooms?: unknown;
  runTs?: unknown;
};

function pickString(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}

function normalizeSource(v: string): "all" | "otodom" | "olx" {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "otodom") return "otodom";
  if (s === "olx") return "olx";
  return "all";
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

      // ✅ wspieramy: body.filters (nowy kontrakt) oraz body.* (stary kontrakt)
      const filters = ((body.filters && typeof body.filters === "object") ? body.filters : body) as IncomingFilters;

      // ✅ kompatybilność wstecz: body.q/body.source
      const qFromFilters = filters ? pickString(filters.q, "") : "";
      const sourceFromFilters = filters ? pickString(filters.source, "all") : "all";

      const q = (qFromFilters || (typeof body.q === "string" ? body.q : "") || "").trim();
      const source = normalizeSource(
        (sourceFromFilters || (typeof body.source === "string" ? body.source : "all") || "all").trim()
      );

      const cursor =
        typeof body.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : "1";

      const runTs =
        (filters && typeof filters.runTs === "string" && filters.runTs.trim()
          ? filters.runTs.trim()
          : typeof body.runTs === "string" && body.runTs.trim()
          ? body.runTs.trim()
          : new Date().toISOString());

      const harvestPages = 2;
      const harvestLimit = 30;

      // ✅ tylko whitelisted źródła dla run (all => otodom+olx)
      const sourcesToRun: Array<"otodom" | "olx"> =
        source === "all" ? ["otodom", "olx"] : [source];

      let harvestedTotal = 0;
      const harvestBySource: Record<string, any> = {};
      const nextCursorBySource: Record<string, string | null> = {};

      for (const src of sourcesToRun) {
        try {
          const j1 = await callInternal(req, "/api/everybot/search", {
            // kontrakt: runTs + filters
            runTs,
            filters: { ...(filters ?? {}), q, source: src, runTs },

            // kompatybilność (tymczasowo)
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

      return res.status(200).json({
        ok: true,
        officeId,
        runTs,
        harvestedTotal,
        harvestBySource,
        nextCursorBySource,
        config: {
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
