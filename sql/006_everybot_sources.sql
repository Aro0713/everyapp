create table if not exists everybot_sources (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  name text not null,
  base_url text not null,
  adapter text not null default 'generic',   -- generic | otodom | olx | gratka ...
  strategy text not null default 'scroll',   -- scroll | pagination | sitemap
  enabled boolean not null default true,
  crawl_interval_minutes int not null default 720,
  last_crawled_at timestamptz null,
  last_status text null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_everybot_sources_office_enabled
  on everybot_sources(office_id, enabled);

create index if not exists idx_everybot_sources_due
  on everybot_sources(enabled, last_crawled_at);

drop trigger if exists trg_everybot_sources_updated_at on everybot_sources;
create trigger trg_everybot_sources_updated_at
before update on everybot_sources
for each row execute function set_updated_at();
