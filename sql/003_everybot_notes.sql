create table if not exists external_listing_notes (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  external_listing_id uuid not null,
  user_id uuid not null,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_everybot_notes_office_external_created
  on external_listing_notes(office_id, external_listing_id, created_at desc);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_everybot_notes_updated_at on external_listing_notes;
create trigger trg_everybot_notes_updated_at
before update on external_listing_notes
for each row execute function set_updated_at();
