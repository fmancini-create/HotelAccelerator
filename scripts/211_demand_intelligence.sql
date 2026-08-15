-- 211_demand_intelligence.sql
--
-- "Cervello" per gruppo di lavoro + calendario della domanda.
--
-- Tre tabelle nuove e una colonna aggiunta a una tabella che esisteva gia'
-- ma non era mai stata usata (`contact_date_requests`: 0 righe, 0 chiamanti).
-- Riusarla e' preferibile a inventarne una parallela: le sue colonne
-- (requested_check_in/out, guests_*, outcome, quoted_rate_cents) sono
-- esattamente quelle della domanda camere.
--
-- Le policy RLS ricalcano quelle gia' in uso su `contact_date_requests` e
-- `user_groups`: `auth_property_id()` per l'isolamento fra strutture,
-- `auth_is_super_admin()` per il superadmin, piu' un `deny_anon` esplicito.

-- ---------------------------------------------------------------------------
-- 1. Configurazione: cosa ogni gruppo di lavoro vuole tracciare
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS group_tracking_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  is_enabled   boolean NOT NULL DEFAULT false,
  preset       text NOT NULL DEFAULT 'libero',
  sources      jsonb NOT NULL DEFAULT '{"email_channel_ids":[],"messaging_kinds":[],"include_phone":false}'::jsonb,
  fields       jsonb NOT NULL DEFAULT '[]'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  last_run_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  CONSTRAINT group_tracking_configs_group_unique UNIQUE (group_id)
);

COMMENT ON TABLE group_tracking_configs IS
  'Cosa il cervello deve estrarre per un gruppo di lavoro (reparto), e da quali sorgenti.';
COMMENT ON COLUMN group_tracking_configs.version IS
  'Sale a ogni modifica dei campi. Una estrazione fatta con la configurazione vecchia non va confusa con una nuova: senza questo non si saprebbe piu'' a quale domanda risponde un dato.';
COMMENT ON COLUMN group_tracking_configs.sources IS
  'Caselle email (email_channel_ids), TIPI di canale di messaggistica (messaging_kinds) e include_phone. Due vie diverse perche'' misurate diverse: channel_id e'' popolato su tutte le 7.375 email, mentre sulla messaggistica e'' sempre nullo e 3 dei 5 id in metadata puntano a canali che non esistono piu''.';

CREATE INDEX IF NOT EXISTS idx_gtc_property ON group_tracking_configs(property_id);

-- ---------------------------------------------------------------------------
-- 2. Esito dell'analisi, una riga per conversazione (o chiamata) e gruppo
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversation_extractions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  phone_call_id   uuid REFERENCES phone_calls(id) ON DELETE CASCADE,
  config_version  integer NOT NULL DEFAULT 1,
  kind            text NOT NULL,
  reference_date  date,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence      numeric(3,2),
  method          text NOT NULL,
  model           text,
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  cost_micro_usd  integer NOT NULL DEFAULT 0,
  truncated       boolean NOT NULL DEFAULT false,
  extracted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_extractions_target CHECK (
    (conversation_id IS NOT NULL AND phone_call_id IS NULL) OR
    (conversation_id IS NULL AND phone_call_id IS NOT NULL)
  )
);

COMMENT ON TABLE conversation_extractions IS
  'Cosa il cervello ha estratto da una conversazione o da una chiamata, per un gruppo.';
COMMENT ON COLUMN conversation_extractions.kind IS
  'Esito tipizzato. Include ''nessuna_domanda'': anche il silenzio e'' un esito registrato, altrimenti lo stesso rumore verrebbe rianalizzato per sempre.';
COMMENT ON COLUMN conversation_extractions.cost_micro_usd IS
  'Costo in milionesimi di dollaro. In centesimi ogni riga sarebbe 0 (misurato: ~1.200 milionesimi per conversazione), e un costo che risulta sempre zero non e'' una misura.';
COMMENT ON COLUMN conversation_extractions.truncated IS
  'Vero se il testo e'' stato tagliato al tetto: il taglio va dichiarato sulla riga, non nascosto.';

-- Idempotenza garantita dal database, non da un "esiste gia'?" in codice che
-- due esecuzioni contemporanee scavalcano. Due indici distinti perche' il
-- bersaglio e' o una conversazione o una chiamata.
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_conversation
  ON conversation_extractions(conversation_id, group_id, config_version)
  WHERE conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_phone_call
  ON conversation_extractions(phone_call_id, group_id, config_version)
  WHERE phone_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extraction_property_date
  ON conversation_extractions(property_id, reference_date);
CREATE INDEX IF NOT EXISTS idx_extraction_group_kind
  ON conversation_extractions(group_id, kind);

-- ---------------------------------------------------------------------------
-- 3. Calendario della domanda, aggregato per giorno
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demand_calendar_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  group_id    uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  date        date NOT NULL,
  metric      text NOT NULL,
  value       numeric NOT NULL DEFAULT 0,
  breakdown   jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE demand_calendar_days IS
  'Domanda aggregata per giorno. Materializzata per non ricalcolare 7.400 conversazioni a ogni apertura e per avere un dato stabile da spedire a Santaddeo.';

-- group_id puo' essere NULL (totale di struttura). In un UNIQUE normale due
-- NULL sono considerati diversi e si creerebbero righe doppie.
--
-- La prima versione normalizzava il NULL con COALESCE: quell'indice e'
-- FUNZIONALE e ON CONFLICT pretende le colonne esatte, quindi lo scarta.
-- Il ricalcolo avrebbe inserito righe nuove invece di aggiornare, raddoppiando
-- in silenzio il totale di struttura a ogni passata. NULLS NOT DISTINCT dice
-- la stessa cosa restando un indice su colonne.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demand_day
  ON demand_calendar_days(
    property_id,
    group_id,
    date,
    metric
  ) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_demand_property_date
  ON demand_calendar_days(property_id, date);

-- ---------------------------------------------------------------------------
-- 4. Riferimento esterno sulla tabella riusata
-- ---------------------------------------------------------------------------

-- Il numero di prenotazione di Scidoo e' la chiave naturale: senza di esso una
-- seconda passata inserirebbe di nuovo le stesse 622 conferme.
ALTER TABLE contact_date_requests ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE contact_date_requests ADD COLUMN IF NOT EXISTS nights integer;

COMMENT ON COLUMN contact_date_requests.external_ref IS
  'Riferimento della sorgente (es. numero prenotazione Scidoo). Chiave naturale per non duplicare a ogni passata.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cdr_external_ref
  ON contact_date_requests(property_id, source, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cdr_property_checkin
  ON contact_date_requests(property_id, requested_check_in);

-- ---------------------------------------------------------------------------
-- 5. RLS: stesso schema delle tabelle esistenti
-- ---------------------------------------------------------------------------

ALTER TABLE group_tracking_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_calendar_days     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_anon ON group_tracking_configs;
CREATE POLICY deny_anon ON group_tracking_configs
  AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_anon ON conversation_extractions;
CREATE POLICY deny_anon ON conversation_extractions
  AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_anon ON demand_calendar_days;
CREATE POLICY deny_anon ON demand_calendar_days
  AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS group_tracking_configs_tenant_scoped ON group_tracking_configs;
CREATE POLICY group_tracking_configs_tenant_scoped ON group_tracking_configs
  FOR ALL
  USING ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()))
  WITH CHECK ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()));

DROP POLICY IF EXISTS conversation_extractions_tenant_scoped ON conversation_extractions;
CREATE POLICY conversation_extractions_tenant_scoped ON conversation_extractions
  FOR ALL
  USING ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()))
  WITH CHECK ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()));

DROP POLICY IF EXISTS demand_calendar_days_tenant_scoped ON demand_calendar_days;
CREATE POLICY demand_calendar_days_tenant_scoped ON demand_calendar_days
  FOR ALL
  USING ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()))
  WITH CHECK ((property_id = (SELECT auth_property_id())) OR (SELECT auth_is_super_admin()));
