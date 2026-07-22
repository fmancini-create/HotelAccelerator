-- =============================================================================
-- ETL JOBS HONEYPOT — documento di tracking
-- =============================================================================
-- Data creazione: 2026-04-20 ~16:19 UTC
-- Data rimozione: 2026-04-22 ~tempo corrente
-- Autore: v0 (agent) per investigazione su autorizzazione utente (risposta "2"
--   alla domanda "Quale preferisci, 1 o 2?" dove 2 = trappola diagnostica).
--
-- SCOPO
-- -----
-- Identificare il mandante del "ghost cron" che ogni 30 minuti inseriva 4
-- righe in public.etl_jobs con triggered_by='cron', status='failed',
-- records_processed=50, records_failed=50, error_message=null. Gli endpoint
-- Vercel del progetto erano già stati scagionati via grep del codice e via
-- log runtime Vercel (zero hit su /api/etl/run nei tick ghost).
--
-- OGGETTI CREATI (ORA RIMOSSI)
-- ----------------------------
-- 1) public.etl_jobs_honeypot  — tabella di raccolta dati forensic
-- 2) public._etl_jobs_honeypot_trigger()  — funzione trigger SECURITY DEFINER
-- 3) _etl_jobs_honeypot_trigger  — trigger BEFORE INSERT su public.etl_jobs
--
-- Il trigger era NON BLOCCANTE (EXCEPTION WHEN OTHERS RETURN NEW) e filtrava
-- solo su NEW.triggered_by='cron' per catturare esclusivamente le richieste
-- sospette senza impattare il traffico legittimo (cron_sync, cron_gsheets_sync,
-- manual, ecc.).
--
-- DATI CATTURATI — il trigger ha registrato i dati del ghost tick.
--   Ogni record conteneva:
--     request_headers  (jsonb)  — tutti gli header HTTP propagati da PostgREST
--     jwt_claims       (jsonb)  — payload JWT decodificato
--     request_method / request_path / client_addr / application_name
--
-- IDENTIFICAZIONE DEL MANDANTE (evidenze dai dati catturati)
-- ----------------------------------------------------------
-- - jwt_claims.role          = "service_role"
-- - jwt_claims.iat           = 1761414203  (2025-10-25 UTC)
-- - jwt_claims.exp           = 2076990203  (anno 2035)
-- - request_headers.host     = aeynirkfixurikshxfov.supabase.co
-- - request_headers."user-agent"    = "node"
-- - request_headers."x-client-info" = "supabase-js-node/2.76.1"
-- - request_headers."x-vercel-id"   = "iad1::..."  (serverless function AWS us-east-1)
-- - request_headers."x-forwarded-for" = IP variabili su range AWS us-east-1
--   es: 3.227.252.79, 54.173.66.21, 184.72.92.89, 3.238.133.84, 100.54.243.239
--
-- CONCLUSIONE FORENSIC
-- --------------------
-- Il ghost cron NON è un attore esterno. È una serverless function che gira
-- sulla rete Vercel (header x-vercel-id presente), usa il Supabase JS client
-- node (user-agent=node, x-client-info=supabase-js-node/2.76.1), autenticata
-- con la SUPABASE_SERVICE_ROLE_KEY del progetto. Il JWT catturato combacia
-- con quello rilasciato dal progetto santaddeo stesso.
--
-- Ipotesi residue:
--   a) cron registrato su un vecchio deployment Vercel (alias/preview ancora
--      attivo) che richiama un endpoint non più presente in vercel.json
--   b) endpoint del repository che ancora istanzia ETLOrchestrator con
--      parametri hardcoded "triggered_by=cron" + "job_type=full_sync" che
--      precedenti grep avevano mancato
--
-- Nessuna ulteriore azione applicata. La trappola è stata rimossa come da
-- richiesta dell'utente.
-- =============================================================================

-- DDL originale applicato il 2026-04-20 (per riferimento — NON riapplicare):
/*
CREATE TABLE IF NOT EXISTS public.etl_jobs_honeypot (
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  new_row_id text,
  new_hotel_id text,
  new_triggered_by text,
  new_job_type text,
  jwt_claims jsonb,
  request_headers jsonb,
  request_method text,
  request_path text,
  pg_user text,
  application_name text,
  client_addr text,
  raw_settings jsonb
);

CREATE OR REPLACE FUNCTION public._etl_jobs_honeypot_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_headers text; v_jwt text; v_method text; v_path text;
BEGIN
  IF NEW.triggered_by = 'cron' THEN
    v_headers := current_setting('request.headers', true);
    v_jwt := current_setting('request.jwt.claims', true);
    v_method := current_setting('request.method', true);
    v_path := current_setting('request.path', true);
    INSERT INTO public.etl_jobs_honeypot(
      new_row_id, new_hotel_id, new_triggered_by, new_job_type,
      jwt_claims, request_headers, request_method, request_path,
      pg_user, application_name, client_addr, raw_settings
    ) VALUES (
      NEW.id::text, NEW.hotel_id::text, NEW.triggered_by, NEW.job_type,
      CASE WHEN v_jwt IS NOT NULL AND v_jwt <> '' THEN v_jwt::jsonb ELSE NULL END,
      CASE WHEN v_headers IS NOT NULL AND v_headers <> '' THEN v_headers::jsonb ELSE NULL END,
      v_method, v_path, current_user,
      current_setting('application_name', true),
      (SELECT client_addr::text FROM pg_stat_activity WHERE pid = pg_backend_pid()),
      jsonb_build_object(
        'role', current_setting('role', true),
        'search_path', current_setting('search_path', true),
        'request.jwt.claim.role', current_setting('request.jwt.claim.role', true),
        'request.jwt.claim.sub', current_setting('request.jwt.claim.sub', true)
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE TRIGGER _etl_jobs_honeypot_trigger
  BEFORE INSERT ON public.etl_jobs
  FOR EACH ROW EXECUTE FUNCTION public._etl_jobs_honeypot_trigger();
*/

-- DDL di rimozione (già eseguito il 2026-04-22):
-- DROP TRIGGER IF EXISTS _etl_jobs_honeypot_trigger ON public.etl_jobs;
-- DROP FUNCTION IF EXISTS public._etl_jobs_honeypot_trigger();
-- DROP TABLE IF EXISTS public.etl_jobs_honeypot;
