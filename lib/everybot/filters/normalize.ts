// lib/everybot/filters/normalize.ts

import type { NormalizedFilters, PropertyType, TxType } from "./types";

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}

function normalizePropertyType(v?: string): PropertyType | "" {
  if (!v) return "";

  const s = v.toLowerCase();

  if (s.includes("mieszkan")) return "apartment";
  if (s.includes("dom")) return "house";
  if (s.includes("działk") || s.includes("dzialk") || s.includes("grunt"))
    return "plot";
  if (s.includes("lokal") || s.includes("biur") || s.includes("komerc"))
    return "commercial";

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
  return {
    q: optString(input?.q),

    source:
      typeof input?.source === "string"
        ? input.source.toLowerCase()
        : "all",

    transactionType: normalizeTx(input?.transactionType),
    propertyType: normalizePropertyType(input?.propertyType),

    city: optString(input?.city),
    district: optString(input?.district),

    minPrice: optNumber(input?.minPrice),
    maxPrice: optNumber(input?.maxPrice),
    minArea: optNumber(input?.minArea),
    maxArea: optNumber(input?.maxArea),
    rooms: optNumber(input?.rooms),
  };
}
