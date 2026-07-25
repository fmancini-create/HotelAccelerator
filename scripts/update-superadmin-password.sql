-- Verifica esistenza di un super admin prima di cambiarne la password.
--
-- SICUREZZA: questo file conteneva una password reale in chiaro in un commento,
-- ora rimossa. Vedi docs/SECURITY_SECRET_ROTATION_NOTES.md.
-- Non inserire MAI password reali qui: i file .sql sono tracciati da git.
--
-- Sostituire il placeholder prima di eseguire.

SELECT id, email, role, is_active, created_at, last_login_at
FROM platform_collaborators
WHERE email = '<EMAIL_SUPER_ADMIN>';

-- Per cambiare la password (gestita da Supabase Auth, non da questa tabella):
--
-- Opzione A - dalla dashboard:
--   Supabase Dashboard > Authentication > Users > utente > "Send password recovery"
--
-- Opzione B - via script, con i valori passati da environment
--   (nessun valore in chiaro nel repo):
--   node --env-file-if-exists=.env.local scripts/update-superadmin-password.js
--   env richieste: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_USER_ID, NEW_PASSWORD
