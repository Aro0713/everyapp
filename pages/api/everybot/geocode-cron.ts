import type { NextApiRequest, NextApiResponse } from "next";

function getBaseUrl(req: NextApiRequest) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers.host as string) ||
    "localhost:3000";

  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

        const token = String(req.headers["x-cron-token"] || "");
        const ok = !!token && token === String(process.env.CRON_SECRET || "");

        if (!ok) {
        return res.status(401).json({ error: "UNAUTHORIZED_CRON" });
        }

    const base = getBaseUrl(req);

    const r = await fetch(`${base}/api/everybot/geocode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-internal": "1",
        "x-cron-secret": String(process.env.CRON_SECRET ?? ""),
      },
      body: JSON.stringify({ limit: 50 }),
    });

    const j = await r.json().catch(() => null);

    return res.status(200).json({
      ok: true,
      forwarded: true,
      status: r.status,
      response: j,
    });
  } catch (e: any) {
    console.error("GEOCODE_CRON_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}