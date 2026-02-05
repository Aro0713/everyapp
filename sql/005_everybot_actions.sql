create table if not exists external_listing_actions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  external_listing_id uuid not null,
  user_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_everybot_actions_office_external_created
  on external_listing_actions(office_id, external_listing_id, created_at desc);
