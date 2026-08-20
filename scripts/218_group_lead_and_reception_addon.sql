-- 218 — Ruolo capogruppo + addon "Reception Automatica"
--
-- Migrazione ADDITIVA: nessuna colonna rimossa, nessun dato riscritto.
-- Dopo questa migrazione il comportamento di chiunque resta identico finche'
-- un amministratore non nomina un capogruppo o non attiva l'addon.
--
-- ============================================================================
-- 1. Ruolo capogruppo
-- ============================================================================
-- Il capogruppo NON e' un nuovo tipo di utente: e' una persona che, DENTRO un
-- gruppo, ne e' il responsabile. Per questo la colonna sta sull'appartenenza
-- (user_group_members) e non su admin_users: la stessa persona puo' essere
-- responsabile della Reception e semplice membro dell'Housekeeping.
--
-- `false` per tutti: nessuno diventa capogruppo per effetto della migrazione.
ALTER TABLE user_group_members
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

-- La domanda che il prodotto fa piu' spesso e' "questa persona e' capogruppo
-- di almeno un gruppo?". L'indice copre solo le righe che lo sono: sono poche,
-- e un indice parziale non cresce col numero totale di appartenenze.
CREATE INDEX IF NOT EXISTS idx_user_group_members_leads
  ON user_group_members (user_id)
  WHERE is_lead;

COMMENT ON COLUMN user_group_members.is_lead IS
  'true se questa persona e'' il responsabile (capogruppo) di questo gruppo. '
  'Il ruolo vale per il singolo gruppo, non per tutta la struttura.';

-- ============================================================================
-- 2. Costo dell'addon (il prezzo NON si salva: si calcola)
-- ============================================================================
-- Qui si salva SOLO il costo che sosteniamo. Il prezzo di vendita e' il doppio
-- e viene calcolato ogni volta che serve (lib/modules/pricing.ts).
--
-- Perche' non salvare anche il prezzo: se fossero due colonne, il giorno in cui
-- il costo cambia il prezzo resterebbe quello vecchio, e il margine si
-- assottiglierebbe SENZA che nessuno veda un errore. Con una sola fonte questo
-- non puo' accadere.
ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS monthly_cost_cents integer;

COMMENT ON COLUMN modules.monthly_cost_cents IS
  'Costo mensile in centesimi che la piattaforma sostiene per ogni struttura '
  'che usa il modulo. Il prezzo di vendita NON e'' in tabella: e'' il doppio di '
  'questo valore, calcolato in lib/modules/pricing.ts.';

-- Un costo negativo non esiste; NULL significa "non ancora determinato".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'modules_monthly_cost_non_negative'
  ) THEN
    ALTER TABLE modules
      ADD CONSTRAINT modules_monthly_cost_non_negative
      CHECK (monthly_cost_cents IS NULL OR monthly_cost_cents >= 0);
  END IF;
END $$;

-- ============================================================================
-- 3. L'addon in catalogo
-- ============================================================================
-- `is_available = true` lo rende visibile in catalogo; NON lo attiva per
-- nessuno. L'attivazione per una struttura resta una riga di tenant_modules.
--
-- DO NOTHING, non DO UPDATE: se un domani qualcuno rilancia questa migrazione,
-- un DO UPDATE riscriverebbe `monthly_cost_cents` riportandolo a NULL e
-- cancellando il costo impostato dall'amministratore. Un seed che sovrascrive
-- la configurazione e' un danno silenzioso.
INSERT INTO modules (key, name, description, icon, category, is_core, sort_order, is_available)
VALUES (
  'reception_automatica',
  'Reception Automatica',
  'L''agente osserva come il personale lavora nel gestionale e, dopo aver visto '
    'la stessa procedura ripetersi, la esegue al posto suo. Le operazioni a '
    'rischio alto restano sempre da confermare a mano.',
  -- Minuscolo con i trattini: e' il formato che la mappa delle icone in
  -- components/admin/module-card.tsx si aspetta. Con 'Bot' non trovava nulla e
  -- la scheda ripiegava sull'icona generica.
  'bot',
  'addon',
  false,
  310,
  true
)
ON CONFLICT (key) DO NOTHING;
