-- ============================================================================
-- FIX 16/05/2026: expire_stale_prospect_assignments() referenziava una
-- colonna inesistente `e.expires_at` nella RETURNING della CTE updated.
-- La CTE `expired` proiettava `p.assignment_expires_at` (non aliasata),
-- quindi qualunque accesso a `e.expires_at` produceva 42703 "column does
-- not exist". Risultato: il cron orario falliva ad ogni run, le
-- assegnazioni scadute non venivano svuotate e i venditori inattivi
-- restavano "proprietari" dei prospect per sempre.
--
-- Cron interessato: /api/cron/expire-prospect-assignments (orario).
-- Log incident: 5/16 14:00:47, 13:00, 12:00, ... 16 hits su 16 cron run.
--
-- Fix: usare il nome reale `e.assignment_expires_at`. La signature di
-- ritorno della funzione resta invariata (colonna `expires_at` nel
-- SELECT finale), quindi nessun consumer (route, notifier) va toccato.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_stale_prospect_assignments()
 RETURNS TABLE(
   prospect_id uuid,
   prospect_name text,
   agent_id uuid,
   agent_display_name text,
   agent_user_id uuid,
   agent_email text,
   parent_agent_id uuid,
   expires_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Imposta reason per il trigger history
  PERFORM set_config('app.assignment_unassign_reason', 'expired', true);
  PERFORM set_config('app.assignment_unassign_notes', NULL, true);
  PERFORM set_config('app.assignment_unassigned_by', '', true);

  RETURN QUERY
  WITH expired AS (
    SELECT p.id, p.name, p.assigned_agent_id, p.assignment_expires_at
    FROM public.prospects p
    WHERE p.assigned_agent_id IS NOT NULL
      AND p.assignment_expires_at IS NOT NULL
      AND p.assignment_expires_at <= now()
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.prospects p
      SET assigned_agent_id = NULL,
          assignment_date = NULL,
          assignment_expires_at = NULL,
          assignment_expired_at = now(),
          status = 'unassigned'
    FROM expired e
    WHERE p.id = e.id
    RETURNING p.id, e.assigned_agent_id AS old_agent_id, e.assignment_expires_at AS expires_at, e.name AS prospect_name
  )
  SELECT
    u.id,
    u.prospect_name,
    sa.id,
    sa.display_name,
    sa.user_id,
    sa.email,
    sa.parent_agent_id,
    u.expires_at
  FROM updated u
  JOIN public.sales_agents sa ON sa.id = u.old_agent_id;
END;
$function$;
