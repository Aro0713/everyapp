import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const appUrl = process.env.APP_URL;

  if (!clientId || !appUrl) {
    return res.status(500).send("Missing MICROSOFT_CALENDAR_CLIENT_ID or APP_URL");
  }

  const redirectUri = `${appUrl}/api/calendar/oauth/outlook/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "offline_access User.Read Calendars.Read",
    prompt: "select_account",
  });

  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`);
}