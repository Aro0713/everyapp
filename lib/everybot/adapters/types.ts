// lib/everybot/adapters/types.ts

import type { NormalizedFilters } from "../filters/types";
import type { SourceKey } from "../enrichers/types";

export type DegradedReason =
  | "none"
  | "portal_redirected"
  | "filters_ignored"
  | "captcha_or_block"
  | "unknown";

export type SearchRequest = {
  url: string;
  method: "GET";
  headers?: Record<string, string>;
};

export type SearchMeta = {
  source: SourceKey;
  requestedUrl: string;
  finalUrl: string;
  page: number;

  applied: boolean; // czy portal faktycznie zastosował to co obiecujemy w adapterze
  degradedReason: DegradedReason;
};

export type SearchItem = {
  source: SourceKey;
  source_url: string; // canonical oferta URL
  title: string | null;
  price_amount: number | null;
  currency: string | null;
  location_text: string | null;
  thumb_url: string | null;

  // opcjonalnie — jeśli wyciągniesz z listy
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
};

export type ParseResult = {
  items: SearchItem[];
  meta: SearchMeta;
  hasNext: boolean | null;
};

export type AdapterContext = {
  filters: NormalizedFilters;
  page: number;
  baseUrl?: string | null; // jeśli portal zwraca canonical base dla kolejnych stron
};

export type PortalAdapter = {
  source: SourceKey;

  buildSearchRequest(ctx: AdapterContext): SearchRequest;

  parseSearch(ctx: AdapterContext, html: string, finalUrl: string): ParseResult;

  // opcjonalnie: portal może mieć swoje nextUrl w payloadzie
  getNextBaseUrl?: (ctx: AdapterContext, html: string, finalUrl: string) => string | null;
};
