export type EverybotSource = {
  id: string;
  office_id: string;
  adapter: string;              // 'otodom' | 'olx'
  strategy: string;             // 'url' | 'search' | 'rss'
  enabled: boolean;
  crawl_interval_minutes: number | null;
  last_crawled_at: string | null;
  last_status: string | null;
  meta: any;                    // jsonb z DB
  listing_category: string | null;
  transaction_type: string | null;
  country_code: string | null;
};

export type EverybotResult = {
  source: string;               // 'otodom' | 'olx'
  source_listing_id: string;
  source_url: string;

  title?: string;
  description?: string;

  price_amount?: number;
  currency?: string;

  // Esti-like / tabela
  matched_at?: string;          // ISO
  transaction_type?: "sale" | "rent" | null;

  area_m2?: number | null;
  price_per_m2?: number | null;
  rooms?: number | null;

  floor?: string | null;
  year_built?: number | null;

  voivodeship?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;

  property_type?: string | null;
  owner_phone?: string | null;

  thumb_url?: string | null;

  location_text?: string | null;
  status?: string;              // 'active'
};


export type EverybotAdapter = (
  source: EverybotSource
) => Promise<EverybotResult[]>;
