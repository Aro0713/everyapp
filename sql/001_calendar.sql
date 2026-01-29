-- 001_calendar.sql
-- MVP schema for EveryAPP Calendar + Booking Links
-- Postgres (Neon)

BEGIN;

-- Enable UUID generation (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Core: calendars
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendars (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  owner_user_id uuid NOT NULL,

  name          text NOT NULL DEFAULT 'Mój kalendarz',
  timezone      text NOT NULL DEFAULT 'Europe/Warsaw',

  is_default    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendars_org_id_idx ON calendars(org_id);
CREATE INDEX IF NOT EXISTS calendars_owner_user_id_idx ON calendars(owner_user_id);

-- ─────────────────────────────────────────────────────────────
-- Core: events (EveryAPP as business source of truth)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('draft','scheduled','confirmed','completed','no_show','canceled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  calendar_id    uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,

  -- CRM bindings (nullable, because not every event must be linked)
  lead_id        uuid NULL,
  listing_id     uuid NULL,
  client_id      uuid NULL,

  title          text NOT NULL,
  description    text NULL,
  location_text  text NULL,

  start_at       timestamptz NOT NULL,
  end_at         timestamptz NOT NULL,

  status         event_status NOT NULL DEFAULT 'scheduled',
  created_by     uuid NOT NULL,
  updated_by     uuid NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_time_ok CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS events_org_id_idx ON events(org_id);
CREATE INDEX IF NOT EXISTS events_calendar_id_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_start_at_idx ON events(start_at);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);

-- ─────────────────────────────────────────────────────────────
-- Attendees (internal + external)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendee_status') THEN
    CREATE TYPE attendee_status AS ENUM ('needs_action','accepted','declined','tentative');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS event_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Either internal user or external email
  user_id     uuid NULL,
  email       text NULL,
  name        text NULL,

  status      attendee_status NOT NULL DEFAULT 'needs_action',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendee_identity_ok CHECK (
    (user_id IS NOT NULL AND email IS NULL)
    OR
    (user_id IS NULL AND email IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_attendees_event_id_idx ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS event_attendees_email_idx ON event_attendees(email);

-- ─────────────────────────────────────────────────────────────
-- Booking links (public scheduling link like Calendly-lite)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_type') THEN
    CREATE TYPE booking_type AS ENUM ('meeting','presentation','call');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS booking_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  calendar_id   uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,

  slug          text NOT NULL UNIQUE,            -- used in URL: /book/<slug>
  type          booking_type NOT NULL DEFAULT 'meeting',

  title         text NOT NULL,
  description   text NULL,

  duration_min  integer NOT NULL DEFAULT 45,     -- meeting duration
  buffer_min    integer NOT NULL DEFAULT 10,     -- gap between meetings

  timezone      text NOT NULL DEFAULT 'Europe/Warsaw',

  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT duration_ok CHECK (duration_min BETWEEN 10 AND 240),
  CONSTRAINT buffer_ok CHECK (buffer_min BETWEEN 0 AND 60)
);

CREATE INDEX IF NOT EXISTS booking_links_org_id_idx ON booking_links(org_id);
CREATE INDEX IF NOT EXISTS booking_links_owner_user_id_idx ON booking_links(owner_user_id);

-- Availability windows for booking links (weekly schedule)
-- day_of_week: 1=Mon ... 7=Sun
CREATE TABLE IF NOT EXISTS booking_availability (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_link_id uuid NOT NULL REFERENCES booking_links(id) ON DELETE CASCADE,

  day_of_week    smallint NOT NULL,
  start_time     time NOT NULL,
  end_time       time NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dow_ok CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT time_ok CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS booking_availability_booking_link_id_idx
  ON booking_availability(booking_link_id);

COMMIT;
