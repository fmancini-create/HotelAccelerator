-- HotelAccelerator - avvisi operativi telefonici
-- Una chiamata entrante realmente non recuperata diventa un'azione "da richiamare".
-- I passaggi tra code/gruppi non devono generare falsi positivi visibili: l'avviso
-- resta in grace period per 3 minuti e una successiva chiamata completata da un
-- interno umano (o dal voice agent) chiude automaticamente l'azione.

ALTER TABLE public.phone_calls
  ADD COLUMN IF NOT EXISTS callback_status text,
  ADD COLUMN IF NOT EXISTS callback_visible_after timestamptz,
  ADD COLUMN IF NOT EXISTS callback_number_key text,
  ADD COLUMN IF NOT EXISTS callback_assigned_to uuid,
  ADD COLUMN IF NOT EXISTS callback_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'phone_calls_callback_status_check'
      AND conrelid = 'public.phone_calls'::regclass
  ) THEN
    ALTER TABLE public.phone_calls
      ADD CONSTRAINT phone_calls_callback_status_check
      CHECK (callback_status IS NULL OR callback_status IN ('pending', 'in_progress', 'resolved', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS phone_calls_callback_open_idx
  ON public.phone_calls (property_id, callback_visible_after DESC)
  WHERE callback_status IN ('pending', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS phone_calls_one_open_callback_per_number_idx
  ON public.phone_calls (property_id, callback_number_key)
  WHERE callback_status IN ('pending', 'in_progress')
    AND callback_number_key IS NOT NULL;

COMMENT ON COLUMN public.phone_calls.callback_status IS
  'Stato operativo della chiamata da richiamare: pending, in_progress, resolved, dismissed.';
COMMENT ON COLUMN public.phone_calls.callback_visible_after IS
  'Grace period prima di mostrare una chiamata persa come azione, per assorbire i passaggi tra code.';
COMMENT ON COLUMN public.phone_calls.callback_number_key IS
  'Ultime 9 cifre significative del numero, coerenti con phoneMatchKey().';
COMMENT ON COLUMN public.phone_calls.callback_assigned_to IS
  'admin_users.id dell operatore che ha preso in carico il richiamo; validato server-side nello stesso tenant.';

CREATE OR REPLACE FUNCTION public.telephony_prepare_callback_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_digits text;
  v_key text;
  v_open_exists boolean := false;
BEGIN
  v_digits := regexp_replace(coalesce(NEW.counterpart_number, ''), '[^0-9]', '', 'g');
  IF length(v_digits) >= 6 THEN
    v_key := right(v_digits, 9);
  ELSE
    v_key := NULL;
  END IF;

  NEW.callback_number_key := v_key;

  -- Le modifiche manuali/operative non devono riaprire una riga gia' chiusa.
  IF NEW.callback_status IN ('resolved', 'dismissed') THEN
    RETURN NEW;
  END IF;

  IF NEW.direction = 'inbound'
     AND NEW.status = 'missed'
     AND v_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.phone_calls pc
      WHERE pc.property_id = NEW.property_id
        AND pc.callback_number_key = v_key
        AND pc.callback_status IN ('pending', 'in_progress')
        AND pc.id IS DISTINCT FROM NEW.id
    ) INTO v_open_exists;

    IF NOT v_open_exists AND NEW.callback_status IS NULL THEN
      NEW.callback_status := 'pending';
      NEW.callback_visible_after := coalesce(NEW.ended_at, NEW.started_at, now()) + interval '3 minutes';
      NEW.callback_updated_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.telephony_resolve_callback_after_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NEW.callback_number_key IS NULL
     OR NEW.status <> 'completed'
     OR (NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds < 2) THEN
    RETURN NULL;
  END IF;

  SELECT tel.kind
    INTO v_kind
  FROM public.telephony_extension_labels tel
  WHERE tel.property_id = NEW.property_id
    AND tel.extension = regexp_replace(coalesce(NEW.extension, ''), '[^0-9]', '', 'g')
  LIMIT 1;

  -- Un evento "completed" della coda/gruppo non prova che qualcuno abbia parlato
  -- con il chiamante. Un interno umano non etichettato, shared/other o il voice
  -- agent (extension nulla) invece chiudono il richiamo aperto.
  IF v_kind = 'group' THEN
    RETURN NULL;
  END IF;

  UPDATE public.phone_calls pc
  SET callback_status = 'resolved',
      callback_resolved_at = now(),
      callback_updated_at = now()
  WHERE pc.property_id = NEW.property_id
    AND pc.callback_number_key = NEW.callback_number_key
    AND pc.callback_status IN ('pending', 'in_progress')
    AND (
      NEW.started_at IS NULL
      OR pc.started_at IS NULL
      OR pc.started_at <= NEW.started_at
    );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS phone_calls_prepare_callback_state ON public.phone_calls;
CREATE TRIGGER phone_calls_prepare_callback_state
  BEFORE INSERT OR UPDATE ON public.phone_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.telephony_prepare_callback_state();

DROP TRIGGER IF EXISTS phone_calls_resolve_callback_after_contact ON public.phone_calls;
CREATE TRIGGER phone_calls_resolve_callback_after_contact
  AFTER INSERT OR UPDATE OF status, direction, counterpart_number, extension, duration_seconds, started_at
  ON public.phone_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.telephony_resolve_callback_after_contact();

-- Non retroattiviamo le vecchie chiamate perse: al deploy la coda parte pulita.
-- Le chiavi vengono comunque preparate solo sui nuovi insert/update, evitando una
-- valanga di avvisi storici non piu' azionabili.
