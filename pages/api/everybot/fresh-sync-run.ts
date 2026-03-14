// pages/api/everybot/fresh-sync-run.ts

import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ua = String(req.headers["user-agent"] || "");
    const auth = String(req.headers["authorization"] || "");
    const secret =
      process.env.EVERYBOT_CRON_SECRET ||
      process.env.CRON_SECRET ||
      "";

    const okCronUa = ua.startsWith("vercel-cron");
    const okBearer = !!secret && auth === `Bearer ${secret}`;

    if (!okCronUa && !okBearer) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const appUrl =
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://www.everyapp.pl";

    const officeIds = await fetchOffices();

    let totalInserted = 0;
    let totalParsed = 0;

    for (const officeId of officeIds) {
      const r = await fetch(`${appUrl}/api/everybot/fresh-sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          officeId,
          filters: {},
        }),
      });

      const j = await r.json().catch(() => null);

      totalInserted += j?.inserted ?? 0;
      totalParsed += j?.parsed ?? 0;
    }

    return res.status(200).json({
      ok: true,
      parsed: totalParsed,
      inserted: totalInserted,
      appUrl,
    });
  } catch (e: any) {
    console.error("EVERYBOT_FRESH_RUN_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

async function fetchOffices(): Promise<string[]> {
  const { pool } = await import("../../../lib/neonDb");

  const { rows } = await pool.query(
    `
    select id
    from offices
    `
  );

  return rows.map((r: any) => r.id);
}