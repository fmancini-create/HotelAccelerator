-- cleanup_old_email_logs()
-- Cancella tutti i record dalla tabella email_logs dove sent_at
-- è più vecchio di 90 giorni. Ritorna il numero di righe cancellate.
-- Pensata per essere chiamata periodicamente via cron (es. ogni giorno).

CREATE OR REPLACE FUNCTION cleanup_old_email_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM email_logs
  WHERE sent_at < now() - interval '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'cleanup_old_email_logs: % record cancellati', deleted_count;

  RETURN deleted_count;
END;
$$;
