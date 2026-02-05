do $$ begin
  create type external_listing_status as enum ('new','shortlisted','rejected','converted');
exception when duplicate_object then null;
end $$;

alter table external_listings
  add column if not exists status external_listing_status not null default 'new',
  add column if not exists shortlisted boolean not null default false,
  add column if not exists rejected_reason text null,
  add column if not exists rejected_meta jsonb null,
  add column if not exists converted_listing_id uuid null;

create index if not exists idx_everybot_external_office_status
  on external_listings(office_id, status);

create index if not exists idx_everybot_external_office_shortlisted
  on external_listings(office_id, shortlisted) where shortlisted = true;
