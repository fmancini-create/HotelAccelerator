-- =============================================================================
-- Fix: super_admin deve poter leggere/scrivere tutte le tabelle del progetto.
--
-- Contesto:
-- Il ruolo super_admin (profiles.role = 'super_admin') ha accesso allo switcher
-- hotel di tutte le organizzazioni tramite una policy dedicata su public.hotels,
-- ma 75 tabelle RLS-enabled sono prive di una policy super_admin equivalente.
-- Risultato: super_admin vede gli hotel nello switcher ma quando tenta di
-- leggere dati (revenue_objectives, pricing_*, scidoo_raw_*, ecc.) di un hotel
-- appartenente a una organization diversa dalla propria, RLS restituisce 0 righe.
--
-- Fix applicato:
-- Aggiunta policy "super_admin_all_access" (FOR ALL, USING + WITH CHECK) su
-- ciascuna delle tabelle mancanti. La policy chiama la funzione helper
-- public.is_super_admin() (SECURITY DEFINER, già esistente) e non tocca le
-- policy esistenti: RLS è additivo, quindi non-super-admin continuano a vedere
-- solo i loro record tramite le policy per organization/hotel pre-esistenti.
-- =============================================================================

DO $$
DECLARE
  t text;
  -- Lista delle 75 tabelle rilevate come "MISSING" (RLS abilitata, 0 policy
  -- che menziona super_admin nella qual o nel with_check).
  tables text[] := ARRAY[
    'accelerator_subscriptions','alert_rules','alerts','analytics_snapshots',
    'autopilot_configs','autopilot_price_changes','booking_com_stats','bookings',
    'cancellations','chat_messages','chat_sessions','chat_tier_config',
    'consultant_hotels','daily_availability','daily_data','daily_occupancy',
    'daily_production','dashboard_kpi_configs','feature_development','features',
    'hotel_events','hotel_integrations','hotel_users','info_requests','invoices',
    'kpi_plan_defaults','kpi_suggestions','kpi_thresholds','last_minute_levels',
    'last_sent_prices','marketing_contacts','notification_dismissals',
    'occupancy_band_groups','occupancy_bands','partner_referrals','partners',
    'perf_api_logs','perf_web_vitals','platform_api_keys','platform_knowledge',
    'platform_notifications','platform_webhook_deliveries','platform_webhooks',
    'pms_available_endpoints','pms_cron_settings','pms_integrations',
    'price_change_log','price_guard_checks','pricing_algo_params','pricing_configs',
    'pricing_grid','pricing_recommendations','pricing_variables','profiles',
    'rates','revenue_objectives','rms_canonical_codes','rms_department_revenue',
    'rms_metrics_history','role_permissions','room_type_rate_limits',
    'rpc_rate_limits','scidoo_raw_availability','scidoo_raw_minstay',
    'scidoo_raw_rates','scidoo_raw_room_types','settings_password_reset_tokens',
    'team_invitations','tenant_usage_logs','tenants','upgrade_requests',
    'user_calendar_preferences','user_feedback','user_invitations',
    'user_permissions','weather_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- DROP difensivo: se per un race la policy esistesse già, la sostituiamo.
    EXECUTE format(
      'DROP POLICY IF EXISTS "super_admin_all_access" ON public.%I',
      t
    );
    EXECUTE format(
      'CREATE POLICY "super_admin_all_access" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.is_super_admin()) '
      'WITH CHECK (public.is_super_admin())',
      t
    );
    RAISE NOTICE 'Added super_admin_all_access on public.%', t;
  END LOOP;
END$$;
