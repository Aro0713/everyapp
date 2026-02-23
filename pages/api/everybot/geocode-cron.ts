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
  const appBase = String(process.env.APP_BASE_URL || "").trim();
  if (appBase) return appBase.replace(/\/+$/, "");

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) return `https://${vercelUrl}`;

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
      return res.status(500).json({ error: "MISSING_CRON_SECRET" });
    }

    // ✅ Przywrócone zachowanie: Vercel Cron przechodzi po UA (bez tokena)
    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const okCronUa = ua.startsWith("vercel-cron");

    // ✅ Token nadal działa jako fallback (np. ręczne odpalenie)
    const tokenHeaderRaw = req.headers["x-cron-token"];
    const tokenHeader = Array.isArray(tokenHeaderRaw) ? tokenHeaderRaw[0] : String(tokenHeaderRaw || "");
    const tokenQuery = typeof req.query.token === "string" ? req.query.token : "";

    const okToken =
      (!!tokenHeader && tokenHeader === secret) ||
      (!!tokenQuery && tokenQuery === secret);

    // ✅ Nie wymagamy tokena jeśli to Vercel Cron (tak ma działać)
    if (!okCronUa && !okToken) {
      return res.status(401).json({
        error: "UNAUTHORIZED_CRON",
        debug: {
          ua,
          hasTokenHeader: !!tokenHeader,
          hasTokenQuery: !!tokenQuery,
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

    const text = await r.text().catch(() => "");
    const j = (() => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return { raw: text.slice(0, 500) };
      }
    })();

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