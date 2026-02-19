import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const token = req.headers["x-cron-token"];
    if (!token || token !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "UNAUTHORIZED_CRON" });
    }

    const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/everybot/rcn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-internal": "1",
      },
      body: JSON.stringify({ limit: 50, radiusMeters: 250 }),
    });

    const j = await r.json().catch(() => null);

    return res.status(200).json({
      ok: true,
      forwarded: true,
      status: r.status,
      response: j,
    });

  } catch (e: any) {
    console.error("RCN_CRON_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
