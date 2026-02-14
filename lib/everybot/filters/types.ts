// lib/everybot/filters/types.ts

import type { SourceKey } from "../enrichers/types";

export type TxType = "sale" | "rent";

export type PropertyType =
  | "apartment"
  | "house"
  | "plot"
  | "commercial"
  | "other";

export type NormalizedFilters = {
  // tekst
  q?: string;
  source?: "all" | SourceKey;

  // transakcja / typ
  transactionType?: TxType | "";
  propertyType?: PropertyType | "";

  // lokalizacja
  voivodeship?: string;
  location?: string;
  city?: string;
  district?: string;

  // liczby
  minPrice?: number | null;
  maxPrice?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  rooms?: number | null;

  // aliasy (jeśli używasz w portalSafe/adapters)
  priceMin?: number | null;
  priceMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
};


