-- RevMan: accesso in sola lettura del venditore (sales_agent) ai singoli hotel.
-- Il grant e' per-hotel ed e' concesso/revocato dal SuperAdmin dal pannello
-- abbonamenti. Rimane in lettura: il venditore non puo' creare note/attivita'/file.
--
-- Eseguire nel SQL Editor di Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS revman_sales_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  sales_agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, sales_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_revman_sales_access_hotel ON revman_sales_access(hotel_id);
CREATE INDEX IF NOT EXISTS idx_revman_sales_access_agent ON revman_sales_access(sales_agent_id);

ALTER TABLE revman_sales_access ENABLE ROW LEVEL SECURITY;

-- Service role bypassa la RLS. Aggiungiamo solo una policy minima per il
-- venditore che vuole leggere i propri grant via client (read-only).
DROP POLICY IF EXISTS "agent_can_read_own_grants" ON revman_sales_access;
CREATE POLICY "agent_can_read_own_grants" ON revman_sales_access
  FOR SELECT USING (sales_agent_id = auth.uid());
