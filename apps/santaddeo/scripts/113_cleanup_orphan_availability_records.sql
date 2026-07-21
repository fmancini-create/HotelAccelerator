-- ====================================================================
-- 113_cleanup_orphan_availability_records.sql
-- ====================================================================
-- Pulizia record orfani in rms_availability_daily e daily_availability
-- con room_type_id = NULL.
--
-- CONTESTO (28/04/2026):
-- Le 4 room_types di Tenuta Massabò sono state create il 2026-04-28T13:30:05.
-- Prima di quel momento, gli sync PMS (Scidoo) e i workaround manuali
-- (/api/dati/fix-room-type-etl) hanno scritto record di disponibilità
-- senza poter risolvere la mappatura scidoo_room_type_id → room_types.id.
-- Risultato: ~1377 record orfani su Massabò, dal 2025-01-02 al 2026-12-23.
-- I record orfani sono inutilizzabili da qualsiasi pagina dell'app
-- (tutte le query filtrano per room_type_id) e sporcano gli aggregati
-- nei dashboard di health.
--
-- FIX APPLICATO IN PARALLELO (vedi commit dello stesso giorno):
--   1) lib/etl/processors/availability-processor.ts: hard guard +
--      mirror upsert su rms_availability_daily.
--   2) app/api/dati/fix-room-type-etl/route.ts: skip batch se
--      roomTypeUuid falsy.
--   3) lib/services/gsheets-sync-service.ts: filtro record con
--      room_type_id null in tutti e 3 i punti di scrittura.
--
-- IDEMPOTENTE: rieseguibile in sicurezza (DELETE WHERE … IS NULL).
-- READ-ONLY-SAFE: nessun record con room_type_id valido viene toccato.
-- ====================================================================

-- 1) Snapshot pre-cleanup per audit trail
DO $$
DECLARE
  rms_count INTEGER;
  daily_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rms_count FROM rms_availability_daily WHERE room_type_id IS NULL;
  SELECT COUNT(*) INTO daily_count FROM daily_availability WHERE room_type_id IS NULL;
  RAISE NOTICE '[cleanup] Pre-cleanup: rms_availability_daily orfani = %, daily_availability orfani = %', rms_count, daily_count;
END $$;

-- 2) Cleanup rms_availability_daily
DELETE FROM rms_availability_daily WHERE room_type_id IS NULL;

-- 3) Cleanup daily_availability (per simmetria — anche se per Massabò
--    daily_availability era allineata, su altri hotel potrebbe non esserlo).
DELETE FROM daily_availability WHERE room_type_id IS NULL;

-- 4) Snapshot post-cleanup per conferma
DO $$
DECLARE
  rms_count INTEGER;
  daily_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rms_count FROM rms_availability_daily WHERE room_type_id IS NULL;
  SELECT COUNT(*) INTO daily_count FROM daily_availability WHERE room_type_id IS NULL;
  RAISE NOTICE '[cleanup] Post-cleanup: rms_availability_daily orfani = %, daily_availability orfani = %', rms_count, daily_count;
  IF rms_count > 0 OR daily_count > 0 THEN
    RAISE EXCEPTION 'Cleanup non completo: rimangono % + % orfani', rms_count, daily_count;
  END IF;
END $$;
