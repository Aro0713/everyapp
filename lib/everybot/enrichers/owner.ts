// lib/everybot/enrichers/owner.ts
import type { Enricher, EnrichResult } from "./types";

/**
 * OWNER – ENRICHER
 * Źródło "od właściciela" nie wymaga scrapingu.
 * Zwracamy pusty wynik – dane mają pochodzić z formularza / ręcznego wpisu w CRM.
 */
const ownerEnricher: Enricher = async (_url: string): Promise<EnrichResult> => {
  return {};
};

export default ownerEnricher;
