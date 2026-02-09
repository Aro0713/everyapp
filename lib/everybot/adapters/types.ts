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
  location_text?: string;
  status?: string;              // 'active'
};

export type EverybotAdapter = (
  source: EverybotSource
) => Promise<EverybotResult[]>;
