// lib/everybot/enrichers/types.ts

export type SourceKey = "otodom" | "olx" | "no" | "gratka" | "morizon" | "owner";

export type EnrichResult = {
  // core (Esti-like)
  title?: string | null;
  description?: string | null;

  price_amount?: number | null;
  currency?: string | null;

  transaction_type?: "sale" | "rent" | null;
  property_type?: string | null;

  area_m2?: number | null;
  price_per_m2?: number | null;
  rooms?: number | null;

  floor?: string | null;
  year_built?: number | null;

  voivodeship?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;

  owner_phone?: string | null;

  thumb_url?: string | null;
  matched_at?: string | null; // data publikacji / dodania (ISO)

  // fallback / UX
  location_text?: string | null;
};

export type Enricher = (url: string) => Promise<EnrichResult>;
