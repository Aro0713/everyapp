import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

// TODO: podepnij swój klient OpenAI / agent runtime (u Ciebie gdzieś już jest)
async function callEverybotAgent(input: {
  officeId: string;
  message: string;
  attachments: Array<{ name: string; mime: string; dataBase64: string }>;
}) {
  // MVP: echo + prosta heurystyka
  return {
    reply:
      `OK. Widzę wiadomość i ${input.attachments.length} załącznik(ów). ` +
      `Następny krok: zamienię to na filtry i odświeżę mapę/listę.`,
    suggestedFilters: null as any,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const body = req.body ?? {};
    const message = String(body.message ?? "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!message && attachments.length === 0) {
      return res.status(400).json({ error: "EMPTY" });
    }

    // limit bezpieczeństwa
    const safeAttachments = attachments.slice(0, 5).map((a: any) => ({
      name: String(a.name ?? "file"),
      mime: String(a.mime ?? "application/octet-stream"),
      dataBase64: String(a.dataBase64 ?? ""),
    }));

    const out = await callEverybotAgent({
      officeId,
      message,
      attachments: safeAttachments,
    });

    return res.status(200).json({ ok: true, ...out });
  } catch (e: any) {
    console.error("EVERYBOT_AGENT_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}