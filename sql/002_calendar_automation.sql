BEGIN;

-- 1) scope for calendars: org/user
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_scope') THEN
    CREATE TYPE calendar_scope AS ENUM ('org','user');
  END IF;
END $$;

-- 2) allow office calendars without owner_user_id
ALTER TABLE calendars
  ADD COLUMN IF NOT EXISTS scope calendar_scope NOT NULL DEFAULT 'user';

ALTER TABLE calendars
  ALTER COLUMN owner_user_id DROP NOT NULL;

-- 3) ensure "default org calendar" rules
-- One default org calendar per org
CREATE UNIQUE INDEX IF NOT EXISTS calendars_org_default_unique
ON calendars(org_id)
WHERE scope = 'org' AND is_default = true;

-- One default personal calendar per user per org
CREATE UNIQUE INDEX IF NOT EXISTS calendars_user_default_unique
ON calendars(org_id, owner_user_id)
WHERE scope = 'user' AND is_default = true AND owner_user_id IS NOT NULL;

-- 4) Backfill: mark existing rows (if any) as user calendars (safe default)
UPDATE calendars
SET scope = 'user'
WHERE scope IS NULL;

-- 5) Backfill: create org calendars for all existing offices that don't have one
-- ASSUMPTION: your "org" table is offices(id)
INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default, scope)
SELECT
  o.id,
  NULL,
  'Kalendarz biura',
  'Europe/Warsaw',
  true,
  'org'
FROM offices o
WHERE NOT EXISTS (
  SELECT 1 FROM calendars c
  WHERE c.org_id = o.id AND c.scope = 'org' AND c.is_default = true
);

-- ─────────────────────────────────────────────────────────────
-- AUTOMATION FOR FUTURE: office -> create org calendar
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_org_calendar_for_office()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default, scope)
  VALUES (NEW.id, NULL, 'Kalendarz biura', 'Europe/Warsaw', true, 'org')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_create_calendar ON offices;

CREATE TRIGGER trg_office_create_calendar
AFTER INSERT ON offices
FOR EACH ROW
EXECUTE FUNCTION ensure_org_calendar_for_office();

COMMIT;
