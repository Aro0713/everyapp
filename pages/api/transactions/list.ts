import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/neonDb";
import { getUserIdFromRequest } from "@/lib/session";
import { getOfficeIdForUserId } from "@/lib/office";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "NO_OFFICE" });
    }

    const scope = req.query.scope === "mine" ? "mine" : "office";

    const client = await pool.connect();

    const result = await client.query(
      `
      select
        cc.id,
        cc.case_type,
        cc.status,
        cc.pipeline_stage,
        cc.assigned_user_id,
        cc.created_at,
        cc.updated_at,

        p.full_name as client_name,

        u.full_name as agent_name,

        l.id as listing_id,
        l.price_amount,
        l.currency

      from client_cases cc

      left join parties p
        on p.id = cc.party_id

      left join users u
        on u.id = cc.assigned_user_id

      left join listings l
        on l.case_owner_user_id = cc.assigned_user_id

      where cc.office_id = $1
      ${scope === "mine" ? "and cc.assigned_user_id = $2" : ""}

      order by cc.created_at desc
      limit 200
      `,
      scope === "mine"
        ? [officeId, userId]
        : [officeId]
    );

    client.release();

    const rows = result.rows.map((r) => ({
      id: r.id,
      caseType: r.case_type,
      status: r.status,
      pipelineStage: r.pipeline_stage,
      clientName: r.client_name,
      agentUserId: r.assigned_user_id,
      agentName: r.agent_name,
      priceAmount: r.price_amount,
      currency: r.currency,
      listingId: r.listing_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return res.status(200).json(rows);
  } catch (e: any) {
    console.error("TRANSACTIONS_LIST_ERROR", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}