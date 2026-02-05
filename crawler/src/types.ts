export type EverybotSource = {
  id: string;
  office_id: string;
  name: string;
  base_url: string;
  adapter: string;
  strategy: string;
  enabled: boolean;
  crawl_interval_minutes: number;
  last_crawled_at: string | null;
  meta: any;
};

export type ImportItem = {
  url: string;
  source?: string;
  sourceListingId?: string;
  title?: string;
  description?: string;
  locationText?: string;
  currency?: string;
  priceAmount?: number | string;
  importedFrom?: string;
};
