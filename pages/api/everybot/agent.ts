import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type AgentAction =
  | { type: "set_filters"; filters: Record<string, any> }
  | { type: "run_live"; runTs?: string }
  | { type: "load_neon" }
  | { type: "refresh_map" }
  | { type: "geocode"; limit: number }
  | { type: "open_listing"; url: string };

type AgentResult = {
  reply: string;
  actions: AgentAction[];
};

function nowIso() {
  return new Date().toISOString();
}

// Minimalna walidacja, żeby model nie wysłał śmieci
function sanitizeActions(actions: any[]): AgentAction[] {
  if (!Array.isArray(actions)) return [];
  const out: AgentAction[] = [];

  for (const a of actions) {
    const t = a?.type;

    if (t === "set_filters" && a?.filters && typeof a.filters === "object") {
      out.push({ type: "set_filters", filters: a.filters });
      continue;
    }

    if (t === "run_live") {
      out.push({
        type: "run_live",
        runTs: typeof a?.runTs === "string" && a.runTs.trim() ? a.runTs.trim() : undefined,
      });
      continue;
    }

    if (t === "load_neon") {
      out.push({ type: "load_neon" });
      continue;
    }

    if (t === "refresh_map") {
      out.push({ type: "refresh_map" });
      continue;
    }

    if (t === "geocode") {
      const limit = Number(a?.limit);
      if (Number.isFinite(limit) && limit > 0 && limit <= 200) out.push({ type: "geocode", limit });
      continue;
    }

    if (t === "open_listing") {
      const url = String(a?.url ?? "").trim();
      if (/^https?:\/\//i.test(url)) out.push({ type: "open_listing", url });
      continue;
    }
  }

  return out.slice(0, 6);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "MISSING_OPENAI_API_KEY" });
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

    // MVP: nie “czytamy” jeszcze plików, tylko informujemy że są (meta).
    const attachmentMeta = attachments.slice(0, 5).map((a: any) => ({
      name: String(a?.name ?? "file"),
      mime: String(a?.mime ?? "application/octet-stream"),
      sizeHint: typeof a?.dataBase64 === "string" ? a.dataBase64.length : 0,
    }));

    const filtersSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string" },
        source: { type: "string" },
        transactionType: { type: "string" },
        propertyType: { type: "string" },
        locationText: { type: "string" },
        voivodeship: { type: "string" },
        city: { type: "string" },
        district: { type: "string" },
        minPrice: { type: "string" },
        maxPrice: { type: "string" },
        minArea: { type: "string" },
        maxArea: { type: "string" },
        rooms: { type: "string" },
      },
      required: [
        "q",
        "source",
        "transactionType",
        "propertyType",
        "locationText",
        "voivodeship",
        "city",
        "district",
        "minPrice",
        "maxPrice",
        "minArea",
        "maxArea",
        "rooms",
      ],
    } as const;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        reply: { type: "string" },
        actions: {
          type: "array",
          maxItems: 6,
                items: {
                // ✅ anyOf zwykle mniej konfliktowe niż oneOf
                anyOf: [
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "set_filters" },
                        filters: filtersSchema,
                    },
                    required: ["type", "filters"],
                    },
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "run_live" },
                        runTs: { type: "string" },
                    },
                    required: ["type", "runTs"],
                    },
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "load_neon" },
                    },
                    required: ["type", "runTs"],
                    },
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "refresh_map" },
                    },
                    required: ["type", "runTs"],
                    },
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "geocode" },
                        limit: { type: "number" },
                    },
                    required: ["type", "limit"],
                    },
                    {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        type: { type: "string", const: "open_listing" },
                        url: { type: "string" },
                    },
                    required: ["type", "url"],
                    },
                ],
                },
             },
           },
      required: ["reply", "actions"],
    } as const;

    const model = String(process.env.OPENAI_MODEL || "gpt-4.1-mini");

    const prompt = `
Jesteś agentem sterującym EveryBOT w aplikacji CRM nieruchomości.
Twoim zadaniem jest zamienić wiadomość użytkownika na plan akcji dla UI.

Zasady:
- Jeśli użytkownik mówi "szukaj"/"pokaż"/"znajdź" -> ustaw filtry (set_filters) i uruchom run_live.
- Jeśli użytkownik mówi "odśwież" -> load_neon + refresh_map.
- Jeśli użytkownik mówi "brak pinezek"/"brak punktów" -> geocode limit=50 + refresh_map.
- Jeśli użytkownik podaje link do ogłoszenia -> open_listing(url).
- Filtry ustawiaj możliwie precyzyjnie (city/district/voivodeship/minPrice/maxPrice/minArea/maxArea/rooms/propertyType/transactionType).
- Nie zgaduj: jeśli brakuje lokalizacji albo typu, zapytaj w reply, ale nadal możesz ustawić to co pewne.
- Gdy zwracasz set_filters, MUSISZ zwrócić wszystkie pola filtrów jako stringi (puste jeśli nieznane).
`.trim();

    const userText =
      (message ? message : "(brak tekstu — tylko załączniki)") +
      (attachmentMeta.length
        ? `\n\nZałączniki(meta): ${JSON.stringify(attachmentMeta).slice(0, 1500)}`
        : "");

    const r = await openai.responses.create({
      model,
      input: [
        { role: "system", content: `${prompt}\nofficeId=${officeId}` },
        { role: "user", content: userText },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "EverybotAgentResult",
          schema,
        },
      },
    });

    const rawText = r.output_text ?? "";
    let parsed: AgentResult | null = null;

    try {
      parsed = rawText ? (JSON.parse(rawText) as AgentResult) : null;
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed.reply !== "string") {
      const fallback: AgentResult = {
        reply: "Nie mogę jeszcze wygenerować planu akcji. Napisz: miasto + typ (dom/mieszkanie/działka) + budżet.",
        actions: [],
      };
      return res.status(200).json({ ok: true, ...fallback });
    }

    const actions = sanitizeActions(parsed.actions);

    for (const a of actions) {
      if (a.type === "run_live" && !a.runTs) (a as any).runTs = nowIso();
    }

    return res.status(200).json({
      ok: true,
      reply: parsed.reply,
      actions,
    });
  } catch (e: any) {
    console.error("EVERYBOT_AGENT_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}