import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { routeIntent } from "../../../lib/everyagent/router";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  try {

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const message = String(req.body?.message ?? "").trim();

    if (!message) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const systemPrompt = `
Jesteś EveryAgent – osobistym asystentem agenta nieruchomości.

Twoja rola:
- sekretarka
- analityk rynku
- pomocnik sprzedaży
- organizator pracy

Użytkownik mówi tylko co chce zrobić.
Ty decydujesz jakie narzędzie uruchomić.

Zwróć JSON:

{
 intent: "...",
 reply: "...",
 payload: {}
}

Dostępne intencje:

calendar.create
calendar.search
listing.create
listing.search
area.nearby
message.draft
task.reminder
everybot.search
general.help
`;

    const r = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const text = r.output_text ?? "";

    let parsed: any;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(200).json({
        reply: text,
        actions: []
      });
    }

    const result = await routeIntent(parsed, message);

    return res.status(200).json(result);

  } catch (e: any) {

    console.error("EVERYAGENT_ERROR", e);

    return res.status(500).json({
      error: "EVERYAGENT_ERROR"
    });

  }

}