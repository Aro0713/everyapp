import type { NextApiRequest, NextApiResponse } from "next";
import ical from "node-ical";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type IntegrationRow = {
  id: string;
  org_id: string;
  user_id: string;
  provider: string;
  integration_type: string;
  ics_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_external_id: string | null;
};

async function getOfficeIdForUser(userId: string) {
  const m = await pool.query(
    `
    SELECT office_id
    FROM memberships
    WHERE user_id = $1 AND status = 'active'
    ORDER BY (role = 'owner') DESC, created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return (m.rows[0]?.office_id as string | null) ?? null;
}

async function refreshGoogleToken(refreshToken: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) {
    throw new Error(j?.error_description || j?.error || "GOOGLE_REFRESH_FAILED");
  }

  return {
    accessToken: j.access_token as string,
    expiresAt: j.expires_in
      ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
      : null,
  };
}

async function refreshOutlookToken(refreshToken: string) {
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID || "",
      client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access User.Read Calendars.Read",
    }).toString(),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) {
    throw new Error(j?.error_description || j?.error || "OUTLOOK_REFRESH_FAILED");
  }

  return {
    accessToken: j.access_token as string,
    refreshToken: (j.refresh_token as string | undefined) ?? refreshToken,
    expiresAt: j.expires_in
      ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
      : null,
  };
}

async function ensureValidAccessToken(it: IntegrationRow) {
  const expiresAtMs = it.token_expires_at ? Date.parse(it.token_expires_at) : null;
  const stillValid = expiresAtMs && expiresAtMs > Date.now() + 60_000;

  if (
    (it.provider === "google" || it.integration_type === "google_oauth") &&
    it.refresh_token &&
    !stillValid
  ) {
    const refreshed = await refreshGoogleToken(it.refresh_token);

    await pool.query(
      `
      UPDATE calendar_integrations
      SET access_token = $2,
          token_expires_at = $3,
          updated_at = now()
      WHERE id = $1
      `,
      [it.id, refreshed.accessToken, refreshed.expiresAt]
    );

    return refreshed.accessToken;
  }

  if (
    (it.provider === "outlook" || it.integration_type === "outlook_oauth") &&
    it.refresh_token &&
    !stillValid
  ) {
    const refreshed = await refreshOutlookToken(it.refresh_token);

    await pool.query(
      `
      UPDATE calendar_integrations
      SET access_token = $2,
          refresh_token = $3,
          token_expires_at = $4,
          updated_at = now()
      WHERE id = $1
      `,
      [it.id, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt]
    );

    return refreshed.accessToken;
  }

  return it.access_token;
}

async function upsertExternalEvent(params: {
  orgId: string;
  integrationId: string;
  uid: string;
  title: string;
  description: string | null;
  locationText: string | null;
  startAt: string;
  endAt: string | null;
  raw: unknown;
}) {
  await pool.query(
    `
    INSERT INTO calendar_external_events
      (org_id, integration_id, external_uid, title, description, location_text, start_at, end_at, raw, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb, now())
    ON CONFLICT (integration_id, external_uid, start_at)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      location_text = EXCLUDED.location_text,
      end_at = EXCLUDED.end_at,
      raw = EXCLUDED.raw,
      updated_at = now()
    `,
    [
      params.orgId,
      params.integrationId,
      params.uid,
      params.title,
      params.description,
      params.locationText,
      params.startAt,
      params.endAt,
      JSON.stringify(params.raw),
    ]
  );
}

async function syncIcsOne(it: IntegrationRow) {
  if (!it.ics_url) {
    throw new Error("ICS_URL_MISSING");
  }

  const resp = await fetch(it.ics_url);
  if (!resp.ok) throw new Error(`ICS fetch failed: ${resp.status}`);

  const icsText = await resp.text();
  const data = ical.parseICS(icsText);

  const events = Object.values(data).filter((x: any) => x && x.type === "VEVENT") as any[];

  for (const ev of events) {
    const uid = String(ev.uid ?? ev.id ?? "");
    if (!uid) continue;

    const start = ev.start ? new Date(ev.start) : null;
    const end = ev.end ? new Date(ev.end) : null;
    if (!start) continue;

    await upsertExternalEvent({
      orgId: it.org_id,
      integrationId: it.id,
      uid,
      title: String(ev.summary ?? ""),
      description: ev.description ? String(ev.description) : null,
      locationText: ev.location ? String(ev.location) : null,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      raw: ev,
    });
  }

  return { integrationId: it.id, ok: true, imported: events.length, provider: "ics" };
}

async function syncGoogleOne(it: IntegrationRow) {
  const accessToken = await ensureValidAccessToken(it);
  if (!accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_MISSING");
  }

  const calendarId = it.calendar_external_id || "primary";

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const qs = new URLSearchParams({
    timeMin: from,
    timeMax: to,
    singleEvents: "true",
    orderBy: "startTime",
  });

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(j?.error?.message || "GOOGLE_EVENTS_FETCH_FAILED");
  }

  const items = Array.isArray(j?.items) ? j.items : [];

  for (const ev of items) {
    const startAt = ev?.start?.dateTime || (ev?.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
    const endAt = ev?.end?.dateTime || (ev?.end?.date ? `${ev.end.date}T00:00:00.000Z` : null);
    if (!startAt) continue;

    await upsertExternalEvent({
      orgId: it.org_id,
      integrationId: it.id,
      uid: String(ev.id || ev.iCalUID || crypto.randomUUID()),
      title: String(ev.summary || ""),
      description: ev.description || null,
      locationText: ev.location || null,
      startAt,
      endAt,
      raw: ev,
    });
  }

  return { integrationId: it.id, ok: true, imported: items.length, provider: "google" };
}

async function syncOutlookOne(it: IntegrationRow) {
  const accessToken = await ensureValidAccessToken(it);
  if (!accessToken) {
    throw new Error("OUTLOOK_ACCESS_TOKEN_MISSING");
  }

  const calendarId = it.calendar_external_id || "";
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const url = calendarId
    ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?startDateTime=${encodeURIComponent(
        from
      )}&endDateTime=${encodeURIComponent(to)}`
    : `https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime=${encodeURIComponent(
        from
      )}&endDateTime=${encodeURIComponent(to)}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(j?.error?.message || "OUTLOOK_EVENTS_FETCH_FAILED");
  }

  const items = Array.isArray(j?.value) ? j.value : [];

  for (const ev of items) {
    const startAt = ev?.start?.dateTime
      ? new Date(ev.start.dateTime).toISOString()
      : null;
    const endAt = ev?.end?.dateTime
      ? new Date(ev.end.dateTime).toISOString()
      : null;
    if (!startAt) continue;

    await upsertExternalEvent({
      orgId: it.org_id,
      integrationId: it.id,
      uid: String(ev.id || crypto.randomUUID()),
      title: String(ev.subject || ""),
      description: ev.bodyPreview || null,
      locationText: ev.location?.displayName || null,
      startAt,
      endAt,
      raw: ev,
    });
  }

  return { integrationId: it.id, ok: true, imported: items.length, provider: "outlook" };
}

async function syncOne(it: IntegrationRow) {
  try {
    let result;

    if (it.provider === "ics" || it.integration_type === "ics") {
      result = await syncIcsOne(it);
    } else if (it.provider === "google" || it.integration_type === "google_oauth") {
      result = await syncGoogleOne(it);
    } else if (it.provider === "outlook" || it.integration_type === "outlook_oauth") {
      result = await syncOutlookOne(it);
    } else {
      throw new Error(`UNSUPPORTED_PROVIDER: ${it.provider}/${it.integration_type}`);
    }

    await pool.query(
      `
      UPDATE calendar_integrations
      SET last_sync_at = now(), last_error = NULL, updated_at = now()
      WHERE id = $1
      `,
      [it.id]
    );

    return result;
  } catch (e: any) {
    await pool.query(
      `
      UPDATE calendar_integrations
      SET last_sync_at = now(), last_error = $2, updated_at = now()
      WHERE id = $1
      `,
      [it.id, String(e?.message ?? e)]
    );

    return {
      integrationId: it.id,
      ok: false,
      provider: it.provider,
      integrationType: it.integration_type,
      error: String(e?.message ?? e),
    };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const cronKey = typeof req.query.key === "string" ? req.query.key : null;
    const userId = await getUserIdFromRequest(req);

    if (!userId && cronKey !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (userId) {
      const officeId = await getOfficeIdForUser(userId);
      if (!officeId) {
        return res.status(404).json({ error: "No active office membership" });
      }

      const { rows } = await pool.query(
        `
        SELECT
          id,
          org_id,
          user_id,
          provider,
          integration_type,
          ics_url,
          access_token,
          refresh_token,
          token_expires_at,
          calendar_external_id
        FROM calendar_integrations
        WHERE org_id = $1
          AND user_id = $2
          AND is_enabled = true
        ORDER BY created_at DESC
        `,
        [officeId, userId]
      );

      const out = [];
      for (const it of rows as IntegrationRow[]) {
        out.push(await syncOne(it));
      }

      return res.status(200).json({ ok: true, results: out });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        org_id,
        user_id,
        provider,
        integration_type,
        ics_url,
        access_token,
        refresh_token,
        token_expires_at,
        calendar_external_id
      FROM calendar_integrations
      WHERE is_enabled = true
      ORDER BY created_at DESC
      `
    );

    const out = [];
    for (const it of rows as IntegrationRow[]) {
      out.push(await syncOne(it));
    }

    return res.status(200).json({ ok: true, results: out });
  } catch (e: any) {
    console.error("CAL_SYNC_ALL_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}