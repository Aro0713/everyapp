// lib/everybot/filters/portalSafe.ts
import type { NormalizedFilters } from "./types";
import type { SourceKey } from "../enrichers/types";

/**
 * Portal-safe filtry = tylko to,
 * co jest stabilne w URL danego portalu.
 * Resztę docinamy w Neon.
 */
export function portalSafeFiltersFor(
  source: SourceKey,
  filters: NormalizedFilters
): NormalizedFilters {
  switch (source) {
    case "otodom":
      // Otodom jest niestabilny w path city,
      // więc MVP: tylko q + transactionType
      return {
        q: filters.q,
        transactionType: filters.transactionType,
      };

    case "olx":
      // OLX działa głównie przez q
      return {
        q: filters.q,
      };

    case "gratka":
    case "morizon":
    case "odwlasciciela":
    case "nieruchomosci_online":
    default:
      return {
        q: filters.q,
      };
  }
}
