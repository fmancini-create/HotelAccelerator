-- Script per aggiornare la password del super admin
-- La password viene gestita da Supabase Auth, quindi bisogna usare la dashboard Supabase
-- o l'API admin per cambiarla

-- Questo script verifica che l'utente esista nella tabella platform_collaborators
SELECT id, email, role, is_active, created_at, last_login_at
FROM platform_collaborators
WHERE email = 'f.mancini@4bid.it';

-- NOTA: Per aggiornare la password dell'utente in Supabase Auth:
-- 1. Vai nella Supabase Dashboard > Authentication > Users
-- 2. Trova l'utente f.mancini@4bid.it
-- 3. Clicca sui 3 puntini e seleziona "Send password recovery"
-- OPPURE usa l'API Admin di Supabase:
-- await supabase.auth.admin.updateUserById(userId, { password: 'Pippolo75@' })
