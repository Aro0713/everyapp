import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { routeIntent } from "../../../lib/everyagent/router";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
};

function safeHistory(input: any): ChatMsg[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (m: any) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.text === "string" &&
        m.text.trim()
    )
    .slice(-10)
    .map((m: any) => ({
      role: m.role,
      text: String(m.text).trim(),
    }));
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

    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const history = safeHistory(req.body?.history);

    const uiContext =
      req.body?.uiContext && typeof req.body.uiContext === "object"
        ? req.body.uiContext
        : {};

    const currentView = String(uiContext?.currentView ?? "").trim();
    const currentListingId = String(uiContext?.currentListingId ?? "").trim();
    const currentClientId = String(uiContext?.currentClientId ?? "").trim();
    const currentLocation = String(uiContext?.currentLocation ?? "").trim();
    const clientProfile = String(uiContext?.clientProfile ?? "").trim();

    const currentFilters =
      uiContext?.currentFilters && typeof uiContext.currentFilters === "object"
        ? uiContext.currentFilters
        : null;

    const systemPrompt = `
Jesteś EveryAgent — osobistym asystentem agenta nieruchomości w EveryAPP.

Twoja rola:
- sekretarka
- asystent sprzedaży
- analityk rynku
- organizator pracy
- doradca lokalny
- pomocnik codziennych decyzji
- przyjazny, profesjonalny partner rozmowy

Twoje zachowanie:
- jesteś uprzejmy, rzeczowy i proaktywny
- myślisz perspektywicznie
- nie tylko odpowiadasz, ale proponujesz najlepszy kolejny krok
- jeśli pytanie dotyczy pracy agenta, kierujesz rozmowę do działania
- jeśli pytanie dotyczy miasta, okolicy, kawy, lodów, restauracji, spotkań lub stylu życia, odpowiadasz jak świetny lokalny concierge
- potrafisz pomóc zarówno zawodowo, jak i organizacyjnie

Użytkownik może zapytać o:
- znalezienie oferty
- założenie oferty
- dodanie wydarzenia do kalendarza
- przypomnienie
- szkic wiadomości
- okolicę nieruchomości
- gdzie iść z klientem na kawę
- gdzie zabrać inwestora na lunch lub kolację
- gdzie zrobić prezentację nieruchomości
- gdzie w pobliżu można zjeść lody lub spędzić czas

Zasady pracy:
1. Najpierw rozpoznajesz intencję.
2. Potem decydujesz, czy trzeba użyć narzędzia.
3. Jeśli pytanie dotyczy rekomendacji lokalnych, odpowiadasz pomocnie i konkretnie.
4. Jeśli pytanie dotyczy działania w CRM, przygotowujesz operacyjną odpowiedź i payload.
5. Jeśli to sensowne, kończysz jedną konkretną propozycją następnego kroku.
6. Nie pytaj o rzeczy, które już są znane z historii lub kontekstu UI.
7. Gdy pytanie dotyczy okolicy, zaproponuj 3-5 miejsc i krótko uzasadnij wybór.
8. Gdy pytanie dotyczy klienta premium / inwestora / milionera, dobieraj miejsca i ton bardziej premium.
9. Gdy pytanie dotyczy rodziny, dzieci lub codziennych spraw, dobieraj rekomendacje bardziej praktyczne.
10. Odpowiedź ma być naturalna, użyteczna i konkretna.

Zwracaj WYŁĄCZNIE JSON w tym formacie:

{
  "intent": "...",
  "reply": "...",
  "payload": {}
}

Dozwolone intencje:

calendar.create
calendar.search
listing.create
listing.search
area.nearby
message.draft
task.reminder
everybot.search
general.help

Wskazówki:
- "znajdź / pokaż / szukaj ofert" -> zwykle everybot.search albo listing.search
- "umów / dodaj do kalendarza / wpisz termin" -> calendar.create
- "załóż ofertę / przygotuj ofertę" -> listing.create
- "co jest w pobliżu / gdzie pójść / gdzie kawa / gdzie lody / gdzie kolacja" -> area.nearby albo general.help
- "napisz wiadomość" -> message.draft
- "przypomnij / ustaw przypomnienie" -> task.reminder

Jeśli pytanie jest bardziej doradcze niż systemowe, reply ma być bogatszy, ale nadal zwięzły.
Jeśli pytanie wymaga działania w systemie, payload ma zawierać najważniejsze pola do wykonania akcji.
`.trim();

    const contextBlock = {
      currentView,
      currentListingId,
      currentClientId,
      currentLocation,
      clientProfile,
      currentFilters,
    };

    const r = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `${systemPrompt}\n\nKontekst UI:\n${JSON.stringify(contextBlock)}`,
        },
        ...history.map((m) => ({
          role: m.role,
          content: m.text,
        })),
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "EveryAgentResult",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: {
                type: "string",
                enum: [
                  "calendar.create",
                  "calendar.search",
                  "listing.create",
                  "listing.search",
                  "area.nearby",
                  "message.draft",
                  "task.reminder",
                  "everybot.search",
                  "general.help",
                ],
              },
              reply: { type: "string" },
              payload: {
                type: "object",
                additionalProperties: true,
              },
            },
            required: ["intent", "reply", "payload"],
          },
        },
      },
    });

    const text = r.output_text ?? "";

    let parsed: any;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(200).json({
        reply:
          text ||
          "Mam już wstępną odpowiedź, ale nie udało mi się przygotować pełnego planu działania.",
        actions: [],
      });
    }

    const result = await routeIntent(parsed, message, {
      history,
      uiContext: contextBlock,
    });

    return res.status(200).json(result);
  } catch (e: any) {
    console.error("EVERYAGENT_ERROR", e);

    return res.status(500).json({
      error: "EVERYAGENT_ERROR",
    });
  }
}