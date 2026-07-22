-- Aggiunge la colonna brig_room_code a public.room_types
-- per il lookup `roomCode` (Brig) -> room_type_id (RMS) durante l'ETL.
-- Replica esattamente il pattern già esistente per `scidoo_room_type_id`.
--
-- Idempotente. Nessuna riga viene modificata: è solo una colonna nullable.

ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS brig_room_code text;

COMMENT ON COLUMN public.room_types.brig_room_code IS
  'Codice room type lato BRiG (campo `roomCode` nelle prenotazioni). Nullable: popolato solo per gli hotel con integrazione Brig attiva.';

CREATE INDEX IF NOT EXISTS idx_room_types_brig_room_code
  ON public.room_types(hotel_id, brig_room_code)
  WHERE brig_room_code IS NOT NULL;
