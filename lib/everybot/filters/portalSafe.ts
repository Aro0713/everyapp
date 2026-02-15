// lib/everybot/filters/portalSafe.ts
import type { NormalizedFilters } from "./types";
import type { SourceKey } from "../enrichers/types";

/**
 * Portal-safe filtry = tylko to,
 * co jest stabilne w URL danego portalu.
 * Resztę docinamy w Neon.
 *
 * Zasada:
 * - "safe" = parametry, które realnie da się zakodować w URL danego portalu
 *   bez ryzyka canonical redirect / ignorowania / przestawiania typu.
 * - szczegółowe docinanie (dzielnica, ulica, itd.) robimy po stronie DB.
 */
export function portalSafeFiltersFor(
  source: SourceKey,
  filters: NormalizedFilters
): NormalizedFilters {
  switch (source) {
    case "otodom":
      // Otodom: najlepiej PATH (tx + typ) + opcjonalnie region.
      // City/district w URL są niestabilne -> tniemy w DB.
        return {
        q: filters.q,
        transactionType: filters.transactionType,
        propertyType: filters.propertyType,
        voivodeship: filters.voivodeship,
        city: filters.city,
        district: filters.district,
        street: filters.street,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minArea: filters.minArea,
        maxArea: filters.maxArea,
        rooms: filters.rooms,
        runTs: filters.runTs,
        };

        case "olx":
      // OLX: q + podstawowe filtry są stabilne, lokalizacja też zwykle działa.
         return {
        q: filters.q,
        transactionType: filters.transactionType,
        propertyType: filters.propertyType,
        voivodeship: filters.voivodeship,
        city: filters.city,
        district: filters.district,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        areaMin: filters.areaMin,
        areaMax: filters.areaMax,
        rooms: filters.rooms,
        runTs: filters.runTs,

      } as NormalizedFilters;

    case "morizon":
      // Morizon: zwykle stabilne są: typ, transakcja, miasto/region, cena, metraż.
      return {
        q: filters.q,
        transactionType: filters.transactionType,
        propertyType: filters.propertyType,
        voivodeship: filters.voivodeship,
        city: filters.city,
        district: filters.district,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        areaMin: filters.areaMin,
        areaMax: filters.areaMax,
        rooms: filters.rooms,
        runTs: filters.runTs,

      } as NormalizedFilters;

    case "gratka":
      // Gratka: podobnie – transakcja/typ/lokalizacja/cena/metraż są OK.
      return {
        q: filters.q,
        transactionType: filters.transactionType,
        propertyType: filters.propertyType,
        voivodeship: filters.voivodeship,
         city: filters.city,
        district: filters.district,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        areaMin: filters.areaMin,
        areaMax: filters.areaMax,
        rooms: filters.rooms,
        runTs: filters.runTs,

      } as NormalizedFilters;

    case "odwlasciciela":
    case "nieruchomosci_online":
      // mniejsze portale: na start bezpiecznie q + transakcja + typ + region.
      return {
        q: filters.q,
        transactionType: filters.transactionType,
        propertyType: filters.propertyType,
        voivodeship: filters.voivodeship,
        city: filters.city,
        district: filters.district,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        areaMin: filters.areaMin,
        areaMax: filters.areaMax,
        rooms: filters.rooms,
        runTs: filters.runTs,

      } as NormalizedFilters;

    default:
      // fallback: minimum
      return {
        q: filters.q,
      };
  }
}
