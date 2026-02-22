import type { NextApiRequest, NextApiResponse } from "next";

function getBaseUrl(req: NextApiRequest) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers.host as string) ||
    "localhost:3000";

  return `${proto}://${host}`;
}

function getStableBaseUrl(req: NextApiRequest) {
  // 1) manual override (najlepsze)
  const appBase = String(process.env.APP_BASE_URL || "").trim();
  if (appBase) return appBase.replace(/\/+$/, "");

  // 2) Vercel runtime host
  const vercelUrl = String(process.env.VERCEL_URL || "").trim(); // bez protokołu
  if (vercelUrl) return `https://${vercelUrl}`;

  // 3) fallback z requestu
  return getBaseUrl(req);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) {
      // to ma od razu krzyczeć, bo inaczej będziesz mieć "zielone crony" i nic nie działa
      return res.status(500).json({ error: "MISSING_CRON_SECRET" });
    }

    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const tokenHeader = String(req.headers["x-cron-token"] || "");
    const tokenQuery = typeof req.query.token === "string" ? req.query.token : "";

    const okCronUa = ua.startsWith("vercel-cron");
    const okToken =
      (!!tokenHeader && tokenHeader === secret) ||
      (!!tokenQuery && tokenQuery === secret);

    if (!okCronUa && !okToken) {
      return res.status(401).json({
        error: "UNAUTHORIZED_CRON",
        debug: {
          ua,
          hasTokenHeader: !!tokenHeader,
          hasTokenQuery: !!tokenQuery,
          // nie wyświetlamy sekretu, ale pokazujemy czy env jest ustawione
          hasSecretEnv: !!secret,
        },
      });
    }

    const base = getStableBaseUrl(req);

    const r = await fetch(`${base}/api/everybot/geocode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-internal": "1",
        "x-cron-secret": secret,
      },
      body: JSON.stringify({ limit: 50 }),
    });

    const j = await r.json().catch(() => null);

    // ✅ NIE maskuj statusu
    return res.status(r.status).json({
      ok: r.ok,
      forwarded: true,
      base,
      status: r.status,
      response: j,
    });
  } catch (e: any) {
    console.error("GEOCODE_CRON_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}