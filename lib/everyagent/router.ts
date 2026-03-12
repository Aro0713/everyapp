import { toolEverybotSearch } from "./tools/everybot";
import { toolCalendarCreate } from "./tools/calendar";
import { toolListingCreate } from "./tools/listing";

export async function routeIntent(
  agentResult: any,
  message: string,
  context?: {
    history?: any[];
    uiContext?: any;
  }
) {

  const intent = agentResult?.intent;

  if (intent === "everybot.search") {
    return toolEverybotSearch(message);
  }

  if (intent === "calendar.create") {
    return toolCalendarCreate(agentResult.payload);
  }

  if (intent === "listing.create") {
    return toolListingCreate(agentResult.payload);
  }

  return {
    reply: agentResult?.reply ?? "Nie rozumiem polecenia.",
    actions: []
  };
}