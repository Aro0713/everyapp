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
  // fraza wyszukiwania (np. "dom Kraków")
  q?: string;

  // źródło
  source?: SourceKey | "all";

  // bezpieczne dla portali (częściowo)
  transactionType?: TxType | "";
  propertyType?: PropertyType | "";

  // lokalizacja (MVP: DB-only, nie wciskamy na siłę do URL)
  city?: string;
  district?: string;

  // zakresy – zawsze DB-only
  minPrice?: number | null;
  maxPrice?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  rooms?: number | null;
};
