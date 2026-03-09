import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const url = process.env.CRAWLER_CONTROL_URL;
  const token = process.env.CRAWLER_TRIGGER_TOKEN;

  if (!url || !token) {
    return res.status(500).json({
      ok: false,
      error: "MISSING_CRAWLER_CONFIG",
    });
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));

    return res.status(upstream.status).json({
      ok: !!data?.ok,
      ...data,
    });
  } catch (error) {
    console.error("CRAWLER_PROXY_ERROR", error);

    return res.status(500).json({
      ok: false,
      error: "CRAWLER_PROXY_FAILED",
    });
  }
}