-- Secondo giro. Il criterio del primo era TROPPO STRETTO: cercavo
-- qual = 'true', ma queste politiche sono sempre-vere SCRITTE IN ALTRA FORMA,
-- e la misura comportamentale le ha smascherate (4 tabelle perdevano ancora).
--
--   platform_collaborators_select : (auth.uid() IS NOT NULL) OR true
--   admin_users_select_policy     : (EXISTS(superadmin) OR true)
--   admin_users_update_policy     : (EXISTS(superadmin) OR true)  <- chiunque
--                                    poteva modificarsi il ruolo e promuoversi
--   platform_collaborators_update
--   platform_collaborators_delete : auth.uid() IS NOT NULL  <- qualsiasi utente
--                                    poteva CANCELLARE i super amministratori
--   "Admins can manage photo categories" : EXISTS(admin_users where id=auth.uid())
--                                    = "sei un utente qualsiasi", non "sei del
--                                    mio tenant"
--   embed_scripts_public_read     : status='active' verso public. Le uniche
--                                    due pagine che leggono embed_scripts sono
--                                    amministrative e autenticate: la lettura
--                                    anonima non serve a nessuno.
--
-- admin_users_delete_policy NON viene toccata: e' davvero limitata ai super
-- amministratori, quindi e' corretta.

drop policy if exists "admin_users_select_policy" on public.admin_users;
drop policy if exists "admin_users_update_policy" on public.admin_users;

drop policy if exists "platform_collaborators_select" on public.platform_collaborators;
drop policy if exists "platform_collaborators_update" on public.platform_collaborators;
drop policy if exists "platform_collaborators_delete" on public.platform_collaborators;

drop policy if exists "Admins can manage photo categories" on public.photo_category;

drop policy if exists "embed_scripts_public_read" on public.embed_scripts;
