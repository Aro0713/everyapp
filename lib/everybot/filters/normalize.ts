// lib/everybot/filters/normalize.ts

import type { NormalizedFilters, PropertyType, TxType } from "./types";

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function normalizePropertyType(v?: string): PropertyType | "" {
  if (!v) return "";

  const s = v.toLowerCase();

  if (s.includes("mieszkan")) return "apartment";
  if (s.includes("dom")) return "house";
  if (s.includes("działk") || s.includes("dzialk") || s.includes("grunt")) return "plot";
  if (s.includes("lokal") || s.includes("biur") || s.includes("komerc")) return "commercial";

  return "other";
}

function normalizeTx(v?: string): TxType | "" {
  if (!v) return "";
  const s = v.toLowerCase();
  if (s.includes("sprzed") || s === "sale") return "sale";
  if (s.includes("wynaj") || s === "rent") return "rent";
  return "";
}

export function normalizeFilters(input: any): NormalizedFilters {
  const minPrice = optNumber(input?.minPrice);
  const maxPrice = optNumber(input?.maxPrice);
  const minArea = optNumber(input?.minArea);
  const maxArea = optNumber(input?.maxArea);

  return {
    q: optString(input?.q),

    source: typeof input?.source === "string" ? input.source.toLowerCase() : "all",

    // ✅ kluczowe dla otodom path buildera
    voivodeship: optString(input?.voivodeship),

    transactionType: normalizeTx(input?.transactionType),
    propertyType: normalizePropertyType(input?.propertyType),

    city: optString(input?.city),
    district: optString(input?.district),

    // ✅ zachowujemy istniejące pola (compat)
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    rooms: optNumber(input?.rooms),

    // ✅ aliasy (żeby portalSafe/adapters mogły przejść na spójne nazwy bez refactoru wszystkiego naraz)
    // Jeśli nie masz tych pól w NormalizedFilters, dopisz je w types.ts albo usuń aliasy.
    priceMin: minPrice,
    priceMax: maxPrice,
    areaMin: minArea,
    areaMax: maxArea,
  };
}
