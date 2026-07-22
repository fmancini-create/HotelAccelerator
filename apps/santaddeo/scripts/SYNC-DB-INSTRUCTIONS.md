# Sincronizzazione Database: Produzione → Dev

## Prerequisiti
1. Installa Supabase CLI: https://supabase.com/docs/guides/cli
2. Installa PostgreSQL client (per pg_dump/psql)

## Credenziali
- **PRODUZIONE**: `aeynirkfixurikshxfov.supabase.co`
- **DEV**: `dshdmkmhhbjractpvojp.supabase.co`

## STEP 1: Esporta da Produzione

\`\`\`bash
# Esporta schema + dati da produzione
# Sostituisci [PASSWORD] con la password del database (la trovi in Settings > Database > Connection string)
pg_dump "postgresql://postgres:[PASSWORD]@db.aeynirkfixurikshxfov.supabase.co:5432/postgres" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  > santaddeo_prod_backup.sql
\`\`\`

## STEP 2: Pulisci il DB Dev (Opzionale ma consigliato)

Vai su https://supabase.com/dashboard/project/dshdmkmhhbjractpvojp/sql/new ed esegui:

\`\`\`sql
-- Disabilita trigger temporaneamente
SET session_replication_role = replica;

-- Drop tutte le tabelle (schema public)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Drop tutti i types enum
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- Riabilita trigger
SET session_replication_role = DEFAULT;
\`\`\`

## STEP 3: Importa su Dev

\`\`\`bash
# Importa il backup su dev
# Sostituisci [DEV_PASSWORD] con la password del database dev
psql "postgresql://postgres:[DEV_PASSWORD]@db.dshdmkmhhbjractpvojp.supabase.co:5432/postgres" \
  < santaddeo_prod_backup.sql
\`\`\`

## STEP 4: Verifica

Vai su https://supabase.com/dashboard/project/dshdmkmhhbjractpvojp/editor
e verifica che le tabelle siano state create correttamente.

---

## Alternativa: Solo tabelle specifiche

Se vuoi sincronizzare solo alcune tabelle:

\`\`\`bash
# Export solo tabelle specifiche
pg_dump "postgresql://postgres:[PASSWORD]@db.aeynirkfixurikshxfov.supabase.co:5432/postgres" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -t profiles \
  -t organizations \
  -t hotels \
  -t bookings \
  -t room_types \
  -t scidoo_raw_bookings \
  -t pms_integrations \
  -t user_property_map \
  > santaddeo_partial_backup.sql
\`\`\`

---

## Dove trovare le password

1. Vai su https://supabase.com/dashboard/project/[PROJECT_ID]/settings/database
2. Sezione "Connection string" > "URI"
3. La password è nel formato `postgres:[PASSWORD]@db...`

Oppure in "Database Settings" > "Database password" (se l'hai salvata)
