import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/neonDb";
import { getUserIdFromRequest } from "@/lib/session";
import { getOfficeIdForUserId } from "@/lib/office";

async function getGooglePrimaryCalendar(accessToken: string) {
  const r = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList/primary", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!r.ok) return null;
  return r.json();
}

async function getGoogleEmail(accessToken: string) {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;

  if (!code || !clientId || !clientSecret || !appUrl) {
    return res.status(400).send("Missing OAuth parameters");
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).send("UNAUTHORIZED");
  }

  const officeId = await getOfficeIdForUserId(userId);
  if (!officeId) {
    return res.status(400).send("NO_OFFICE");
  }

  const redirectUri = `${appUrl}/api/calendar/oauth/google/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenJson = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok || !tokenJson?.access_token) {
    return res.status(400).send("GOOGLE_TOKEN_ERROR");
  }

  const profile = await getGoogleEmail(tokenJson.access_token);
  const calendar = await getGooglePrimaryCalendar(tokenJson.access_token);

  const client = await pool.connect();
  try {
    await client.query(
      `
      insert into calendar_integrations (
        org_id,
        user_id,
        provider,
        integration_type,
        name,
        is_enabled,
        external_account_id,
        access_token,
        refresh_token,
        token_expires_at,
        calendar_external_id,
        meta,
        created_at,
        updated_at
      )
      values (
        $1, $2, 'google', 'google_oauth', $3, true, $4, $5, $6, $7, $8, $9::jsonb, now(), now()
      )
      on conflict do nothing
      `,
      [
        officeId,
        userId,
        `Google Calendar${profile?.email ? ` (${profile.email})` : ""}`,
        profile?.email ?? null,
        tokenJson.access_token,
        tokenJson.refresh_token ?? null,
        tokenJson.expires_in
          ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
          : null,
        calendar?.id ?? "primary",
        JSON.stringify({
          provider: "google",
          email: profile?.email ?? null,
          calendarSummary: calendar?.summary ?? null,
        }),
      ]
    );
  } finally {
    client.release();
  }

  res.redirect(`${appUrl}/panel?view=calendar`);
}