-- =====================================================================
-- Fix mismatch tra schema iniziale e API revman_*
-- Da eseguire UNA VOLTA nel SQL editor di Supabase, dopo il primo
-- onboarding-revman-schema.sql.
-- Idempotente: tutto via "IF NOT EXISTS" / "DO" blocks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- revman_notes: API usa author_id/author_role/body/updated_at
-- Schema iniziale: created_by/origin/content
-- ---------------------------------------------------------------------
ALTER TABLE revman_notes
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS author_role TEXT
    CHECK (author_role IN ('tenant', 'staff')),
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: sposta content -> body se body NULL (vecchio schema usava content)
UPDATE revman_notes SET body = content WHERE body IS NULL AND content IS NOT NULL;

-- Backfill: sposta created_by -> author_id se author_id NULL
UPDATE revman_notes SET author_id = created_by WHERE author_id IS NULL AND created_by IS NOT NULL;

-- Default author_role per record esistenti
UPDATE revman_notes SET author_role = 'staff' WHERE author_role IS NULL;

-- Rilascia NOT NULL sulle colonne vecchie (cosi' le INSERT delle API che
-- popolano solo le colonne nuove non falliscono con 23502)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_notes' AND column_name='content' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_notes ALTER COLUMN content DROP NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_notes' AND column_name='created_by' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_notes ALTER COLUMN created_by DROP NOT NULL';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- revman_activities: API usa assigned_to/updated_at, status 'done'
-- Schema iniziale: owner_role, status 'completed'
-- ---------------------------------------------------------------------
ALTER TABLE revman_activities
  ADD COLUMN IF NOT EXISTS assigned_to TEXT
    CHECK (assigned_to IN ('tenant', 'staff')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill assigned_to da owner_role
UPDATE revman_activities SET assigned_to = owner_role WHERE assigned_to IS NULL;

-- Rilascia NOT NULL sulle colonne vecchie
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_activities' AND column_name='owner_role' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_activities ALTER COLUMN owner_role DROP NOT NULL';
  END IF;
END $$;

-- Allarga lo CHECK status per includere sia 'done' (API) che 'completed' (schema)
ALTER TABLE revman_activities DROP CONSTRAINT IF EXISTS revman_activities_status_check;
ALTER TABLE revman_activities
  ADD CONSTRAINT revman_activities_status_check
  CHECK (status IN ('open', 'in_progress', 'done', 'completed', 'cancelled'));

-- ---------------------------------------------------------------------
-- revman_files: API usa file_name/mime_type/uploaded_by_role
-- Schema iniziale: filename/content_type
-- ---------------------------------------------------------------------
ALTER TABLE revman_files
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_role TEXT
    CHECK (uploaded_by_role IN ('tenant', 'staff'));

-- Backfill file_name da filename (vecchio schema)
UPDATE revman_files SET file_name = filename WHERE file_name IS NULL AND filename IS NOT NULL;
UPDATE revman_files SET mime_type = content_type WHERE mime_type IS NULL AND content_type IS NOT NULL;
UPDATE revman_files SET uploaded_by_role = 'staff' WHERE uploaded_by_role IS NULL;

-- Rilascia NOT NULL sulle colonne vecchie cosi' le INSERT con sole colonne
-- nuove non falliscono con 23502 (filename/content_type/uploaded_by NOT NULL)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_files' AND column_name='filename' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_files ALTER COLUMN filename DROP NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_files' AND column_name='content_type' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_files ALTER COLUMN content_type DROP NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='revman_files' AND column_name='uploaded_by' AND is_nullable='NO') THEN
    EXECUTE 'ALTER TABLE revman_files ALTER COLUMN uploaded_by DROP NOT NULL';
  END IF;
END $$;

-- file_name NOT NULL una volta backfillati
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revman_files' AND column_name = 'file_name' AND is_nullable = 'NO'
  ) THEN
    BEGIN
      ALTER TABLE revman_files ALTER COLUMN file_name SET NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- Trigger updated_at su notes/activities (best effort)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revman_notes_updated_at ON revman_notes;
CREATE TRIGGER trg_revman_notes_updated_at
  BEFORE UPDATE ON revman_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_revman_activities_updated_at ON revman_activities;
CREATE TRIGGER trg_revman_activities_updated_at
  BEFORE UPDATE ON revman_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
