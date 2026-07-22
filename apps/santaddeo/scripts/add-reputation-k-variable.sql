-- Adds the "k_reputation_score" pressure variable, fed from hotel_reviews via
-- the reputation_scores_v view. The value (0..10) is written to
-- k_variable_values by the K-values cron (see lib/pricing/k-variables-service.ts).
--
-- category = "external"  (data comes from external OTAs)
-- default_weight = 5     (medium influence; tune per-hotel later)
-- is_active = false      (each hotel activates it via hotel_pricing_variables)
INSERT INTO pricing_variables
  (variable_key, label, description, category, data_type, unit,
   default_weight, weight_min, weight_max, is_active, sort_order)
VALUES
  ('k_reputation_score',
   'Punteggio Reputazione',
   'Punteggio 0-10 calcolato dalle recensioni OTA ultime 180gg (decadimento 90gg), con bonus/malus per trend 30gg vs 60-90gg e penalita per bassi volumi. Alimenta la pressione sul prezzo: reputazione alta -> margine al rialzo.',
   'external', 'numeric', 'score', 5, 0, 10, false, 350)
ON CONFLICT (variable_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  data_type = EXCLUDED.data_type,
  unit = EXCLUDED.unit,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

SELECT variable_key, label, default_weight, category, is_active
FROM pricing_variables
WHERE variable_key = 'k_reputation_score';
