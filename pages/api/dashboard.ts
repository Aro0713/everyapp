import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../lib/neonDb";
import { getUserIdFromRequest } from "../../lib/session";
import { getOfficeIdForUserId } from "../../lib/office";

type Scope = "agent" | "office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  try {
    return new Date(v as any).toISOString();
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const scope = (optString(req.query.scope) === "agent" ? "agent" : "office") as Scope;

    const actionScopeSql =
      scope === "agent"
        ? `office_id = $1::uuid AND user_id = $2::uuid`
        : `office_id = $1::uuid`;

    const listingsScopeSql =
      scope === "agent"
        ? `office_id = $1::uuid AND LOWER(COALESCE(case_owner_name, '')) = LOWER(COALESCE($2::text, ''))`
        : `office_id = $1::uuid`;

    const meRes = await pool.query<{
      full_name: string | null;
      email: string | null;
      office_name: string | null;
      membership_role: string | null;
    }>(
      `
      SELECT
        u.full_name,
        u.email,
        o.name AS office_name,
        m.role AS membership_role
      FROM users u
      LEFT JOIN memberships m
        ON m.user_id = u.id
       AND m.office_id = $1::uuid
       AND m.status = 'active'
      LEFT JOIN offices o
        ON o.id = m.office_id
      WHERE u.id = $2::uuid
      ORDER BY m.created_at DESC
      LIMIT 1
      `,
      [officeId, userId]
    );

    const me = meRes.rows[0] ?? {
      full_name: null,
      email: null,
      office_name: null,
      membership_role: null,
    };

    const [
      callsRes,
      meetingsRes,
      offersInProgressRes,
      newExternalRes,
      todayEventsRes,
      recentActivatedRes,
      recentPriceChangesRes,
      monthGoalsRes,
      teamRes,
    ] = await Promise.all([
      pool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM external_listing_actions
        WHERE ${actionScopeSql}
          AND action = 'call'
          AND created_at >= date_trunc('day', now())
        `,
        scope === "agent" ? [officeId, userId] : [officeId]
      ),

      pool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM events e
        JOIN calendars c
          ON c.id = e.calendar_id
        WHERE c.org_id = $1::uuid
          AND (
            $2::text <> 'agent'
            OR c.owner_user_id = $3::uuid
          )
          AND e.start_at >= date_trunc('day', now())
          AND e.start_at < date_trunc('day', now()) + interval '1 day'
        `,
        [officeId, scope, userId]
      ),

      pool.query<{
        listing_id: string;
        office_id: string;
        record_type: string;
        transaction_type: string;
        status: string;
        created_at: string;
        case_owner_name: string | null;
        parties_summary: string | null;
      }>(
        `
        SELECT
          listing_id::text,
          office_id::text,
          record_type::text,
          transaction_type::text,
          status::text,
          created_at,
          case_owner_name,
          parties_summary
        FROM office_listings_overview
        WHERE ${listingsScopeSql}
          AND status IN ('draft', 'active')
        ORDER BY created_at DESC
        LIMIT 8
        `,
        scope === "agent"
          ? [officeId, me.full_name ?? null]
          : [officeId]
      ),

      pool.query<{
        id: string;
        source: string;
        source_url: string;
        title: string | null;
        price_amount: number | null;
        currency: string | null;
        location_text: string | null;
        imported_at: string | null;
        updated_at: string;
        my_office_saved: boolean | null;
      }>(
        `
        WITH my_saved AS (
          SELECT
            external_listing_id,
            TRUE AS my_office_saved
          FROM external_listing_actions
          WHERE office_id = $1::uuid
            AND action = 'save'
          GROUP BY external_listing_id
        )
        SELECT
          l.id::text,
          l.source::text,
          l.source_url,
          l.title,
          l.price_amount,
          l.currency,
          l.location_text,
          l.imported_at,
          l.updated_at,
          COALESCE(ms.my_office_saved, FALSE) AS my_office_saved
        FROM external_listings l
        LEFT JOIN my_saved ms
          ON ms.external_listing_id = l.id
        WHERE l.office_id = $1::uuid
        ORDER BY COALESCE(l.imported_at, l.updated_at) DESC, l.id DESC
        LIMIT 8
        `,
        [officeId]
      ),

      pool.query<{
        id: string;
        title: string;
        start_at: string;
        end_at: string;
        location_text: string | null;
        description: string | null;
        owner_user_id: string | null;
      }>(
        `
        SELECT
          e.id::text,
          e.title,
          e.start_at,
          e.end_at,
          e.location_text,
          e.description,
          c.owner_user_id::text
        FROM events e
        JOIN calendars c
          ON c.id = e.calendar_id
        WHERE c.org_id = $1::uuid
          AND (
            $2::text <> 'agent'
            OR c.owner_user_id = $3::uuid
          )
          AND e.start_at >= date_trunc('day', now())
          AND e.start_at < date_trunc('day', now()) + interval '1 day'
        ORDER BY e.start_at ASC
        LIMIT 10
        `,
        [officeId, scope, userId]
      ),

      pool.query<{
        listing_id: string;
        office_id: string;
        record_type: string;
        transaction_type: string;
        status: string;
        created_at: string;
        case_owner_name: string | null;
        parties_summary: string | null;
      }>(
        `
        SELECT
          listing_id::text,
          office_id::text,
          record_type::text,
          transaction_type::text,
          status::text,
          created_at,
          case_owner_name,
          parties_summary
        FROM office_listings_overview
        WHERE ${listingsScopeSql}
          AND status = 'active'
          AND created_at >= now() - interval '7 days'
        ORDER BY created_at DESC
        LIMIT 8
        `,
        scope === "agent"
          ? [officeId, me.full_name ?? null]
          : [officeId]
      ),

      pool.query<{
        id: string;
        source: string;
        title: string | null;
        price_amount: number | null;
        currency: string | null;
        updated_at: string;
        location_text: string | null;
      }>(
        `
        SELECT
          id::text,
          source::text,
          title,
          price_amount,
          currency,
          updated_at,
          location_text
        FROM external_listings
        WHERE office_id = $1::uuid
          AND price_amount IS NOT NULL
          AND updated_at >= now() - interval '7 days'
        ORDER BY updated_at DESC, id DESC
        LIMIT 8
        `,
        [officeId]
      ),

      pool.query<{
        calls: string;
        visits: string;
        saved: string;
      }>(
        `
        SELECT
          COUNT(*) FILTER (WHERE action = 'call')::text AS calls,
          COUNT(*) FILTER (WHERE action = 'visit')::text AS visits,
          COUNT(*) FILTER (WHERE action = 'save')::text AS saved
        FROM external_listing_actions
        WHERE ${actionScopeSql}
          AND created_at >= date_trunc('month', now())
        `,
        scope === "agent" ? [officeId, userId] : [officeId]
      ),

      pool.query<{
        members_count: string;
        active_agents: string;
        pending_members: string;
      }>(
        `
        SELECT
          COUNT(*)::text AS members_count,
          COUNT(*) FILTER (WHERE status = 'active' AND role = 'agent')::text AS active_agents,
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_members
        FROM memberships
        WHERE office_id = $1::uuid
        `,
        [officeId]
      ),
    ]);

    return res.status(200).json({
      scope,
      officeId,
      userId,
      me: {
        fullName: me.full_name,
        email: me.email,
        officeName: me.office_name,
        membershipRole: me.membership_role,
      },
      kpis: {
        calls: Number(callsRes.rows[0]?.count ?? 0),
        meetings: Number(meetingsRes.rows[0]?.count ?? 0),
        exports: 0,
        aiNotes: 0,
      },
      offersInProgress: offersInProgressRes.rows.map((r) => ({
        listing_id: r.listing_id,
        office_id: r.office_id,
        record_type: r.record_type,
        transaction_type: r.transaction_type,
        status: r.status,
        created_at: toIso(r.created_at),
        case_owner_name: r.case_owner_name,
        parties_summary: r.parties_summary,
      })),
      topBuyers: [],
      newExternalListings: newExternalRes.rows.map((r) => ({
        id: r.id,
        source: r.source,
        source_url: r.source_url,
        title: r.title,
        price_amount: r.price_amount,
        currency: r.currency,
        location_text: r.location_text,
        created_at: toIso(r.imported_at ?? r.updated_at),
        updated_at: toIso(r.updated_at),
        my_office_saved: !!r.my_office_saved,
      })),
      todayEvents: todayEventsRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        start_at: toIso(r.start_at),
        end_at: toIso(r.end_at),
        location_text: r.location_text,
        description: r.description,
        owner_user_id: r.owner_user_id,
      })),
      recentActivatedOffers: recentActivatedRes.rows.map((r) => ({
        listing_id: r.listing_id,
        office_id: r.office_id,
        record_type: r.record_type,
        transaction_type: r.transaction_type,
        status: r.status,
        created_at: toIso(r.created_at),
        case_owner_name: r.case_owner_name,
        parties_summary: r.parties_summary,
      })),
      recentPriceChanges: recentPriceChangesRes.rows.map((r) => ({
        id: r.id,
        source: r.source,
        title: r.title,
        price_amount: r.price_amount,
        currency: r.currency,
        updated_at: toIso(r.updated_at),
        location_text: r.location_text,
      })),
      goals: {
        calls: Number(monthGoalsRes.rows[0]?.calls ?? 0),
        visits: Number(monthGoalsRes.rows[0]?.visits ?? 0),
        saved: Number(monthGoalsRes.rows[0]?.saved ?? 0),
        revenue: 0,
      },
      teamSnapshot: {
        membersCount: Number(teamRes.rows[0]?.members_count ?? 0),
        activeAgents: Number(teamRes.rows[0]?.active_agents ?? 0),
        pendingMembers: Number(teamRes.rows[0]?.pending_members ?? 0),
      },
      exportErrors: [],
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("DASHBOARD_ERROR", e);
    return res.status(500).json({ error: e?.message ?? "Internal server error" });
  }
}