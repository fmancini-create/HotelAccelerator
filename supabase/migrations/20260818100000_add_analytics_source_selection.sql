-- Quali sorgenti contano nelle statistiche.
--
-- Si salva la scelta PER SORGENTE e non per tipo di canale: misurato che le 5
-- caselle email di questa struttura includono 2 caselle di 4BID Srl (l'agenzia,
-- 209 conversazioni) e la posta personale del titolare (6806). Un interruttore
-- "email si/no" avrebbe mescolato l'hotel con l'agenzia, che e' esattamente il
-- numero fuorviante da eliminare (7682 "conversazioni email" nel cruscotto).
--
-- Assenza di righe = tutte le sorgenti contano, cioe' il comportamento di oggi:
-- una tabella vuota non deve far crollare i cruscotti a zero.

CREATE TABLE IF NOT EXISTS public.analytics_source_selection (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Tipo di sorgente: 'email_channel' (una casella) oppure 'messaging_channel'.
  source_kind  text NOT NULL CHECK (source_kind IN ('email_channel', 'messaging_channel')),

  -- Identificativo della sorgente nella sua tabella (email_channels.id o
  -- messaging_channels.id). Non e' una chiave esterna perche' punta a due
  -- tabelle diverse; la pagina mostra solo sorgenti esistenti.
  source_id    uuid NOT NULL,

  -- false = esclusa dalle statistiche. La riga esiste solo quando la scelta
  -- viene fatta a mano, cosi' si distingue "escluso" da "mai deciso".
  included     boolean NOT NULL DEFAULT true,

  updated_by   uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (property_id, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS analytics_source_selection_property_idx
  ON public.analytics_source_selection (property_id, included);

ALTER TABLE public.analytics_source_selection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_anon ON public.analytics_source_selection;
CREATE POLICY deny_anon ON public.analytics_source_selection
  AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS analytics_source_selection_tenant_scoped ON public.analytics_source_selection;
CREATE POLICY analytics_source_selection_tenant_scoped ON public.analytics_source_selection
  FOR ALL
  USING ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()))
  WITH CHECK ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()));

COMMENT ON TABLE public.analytics_source_selection IS
  'Sorgenti (caselle email, canali di messaggistica) incluse nelle statistiche. Nessuna riga = tutte incluse.';
