import type { NextApiRequest, NextApiResponse } from "next";
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
    const q = typeof body.q === "string" ? body.q : "";
    const source = typeof body.source === "string" ? body.source : "all";

    const harvestPages = 5;
    const harvestLimit = 50;

    // 1) HARVEST (realny Live Hunter)
    const sourcesToRun = source === "all" ? ["otodom", "olx"] : [source];

  let harvestedTotal = 0;
const harvestBySource: Record<string, any> = {};
const nextCursorBySource: Record<string, string | null> = {};

const cursor = typeof body.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : "1";

for (const src of sourcesToRun) {
  try {
    const j1 = await callInternal(req, "/api/everybot/search", {
      q,
      source: src,
      cursor,
      limit: harvestLimit,
      pages: harvestPages,
    });

    harvestBySource[src] = j1;
    nextCursorBySource[src] = typeof j1?.nextCursor === "string" ? j1.nextCursor : null;
    harvestedTotal += Number(j1?.upserted ?? 0) || 0;
  } catch (e: any) {
    harvestBySource[src] = { error: e?.message ?? String(e) };
    nextCursorBySource[src] = null;
    // ✅ nie przerywamy całego run gdy OLX/portal da 403
  }
}


    // 2) ENRICH loop
    let enrichTotal = 0;
    for (let i = 0; i < 6; i++) {
      const j2 = await callInternal(req, "/api/everybot/enrich", { limit: 50 });
      const processed = Number(j2?.processed ?? 0);
      if (!Number.isFinite(processed) || processed <= 0) break;
      enrichTotal += processed;
    }

    // 3) VERIFY loop
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
  config: { q, source, cursor, harvestPages, harvestLimit },
});

  } catch (e: any) {
    console.error("EVERYBOT_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
