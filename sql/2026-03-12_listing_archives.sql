CREATE TABLE IF NOT EXISTS public.listing_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_listing_id uuid,
  office_id uuid NOT NULL,
  archived_by_user_id uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),

  record_type text,
  transaction_type text,
  status text,

  created_by_user_id uuid,
  case_owner_user_id uuid,

  contract_type text,
  market text,
  internal_notes text,

  currency text,
  price_amount numeric,
  budget_min numeric,
  budget_max numeric,

  area_min_m2 numeric,
  area_max_m2 numeric,
  rooms_min integer,
  rooms_max integer,

  location_text text,

  title text,
  description text,
  property_type text,
  area_m2 numeric,
  rooms integer,
  floor text,
  year_built integer,

  voivodeship text,
  city text,
  district text,
  street text,
  postal_code text,

  lat double precision,
  lng double precision,

  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_listing_archives_original_listing_id
  ON public.listing_archives(original_listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_archives_office_id
  ON public.listing_archives(office_id);

CREATE INDEX IF NOT EXISTS idx_listing_archives_archived_at
  ON public.listing_archives(archived_at DESC);

CREATE TABLE IF NOT EXISTS public.listing_archive_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id uuid NOT NULL REFERENCES public.listing_archives(id) ON DELETE CASCADE,
  original_image_id uuid,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_archive_images_archive_id
  ON public.listing_archive_images(archive_id, sort_order);

CREATE TABLE IF NOT EXISTS public.listing_archive_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id uuid NOT NULL REFERENCES public.listing_archives(id) ON DELETE CASCADE,
  original_action_id uuid,
  office_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_archive_actions_archive_id
  ON public.listing_archive_actions(archive_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_archive_actions_office_id
  ON public.listing_archive_actions(office_id, created_at DESC);