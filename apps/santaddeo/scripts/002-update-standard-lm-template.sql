-- =============================================================================
-- Update the "Standard" last-minute level template based on Villa I Barronci's
-- current configuration, converting every parameter to percentage mode.
--
-- The new template is richer than the previous one: each top-level level now
-- carries its own `occupancy_bands` (inner growth/discount rules) so that new
-- hotels loading the Standard template get a fully-featured baseline instead
-- of a flat default-discount-only setup.
--
-- Safe to re-run: we UPSERT by `template_name`.
-- =============================================================================

INSERT INTO public.last_minute_level_templates (template_name, description, levels)
VALUES (
  'Standard',
  'Template standard basato su Villa I Barronci: 6 livelli di intensità con bande di crescita tariffa interne. Tutti i parametri sono espressi in percentuale.',
  $json$
  [
    {
      "name": "Minimo (quasi pieno)",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 0,
      "max_occupancy_pct": 5,
      "occupancy_mode": "pct",
      "discount_pct": 5,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": []
    },
    {
      "name": "Leggero",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 5,
      "max_occupancy_pct": 15,
      "occupancy_mode": "pct",
      "discount_pct": 10,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": [
        { "min_occupancy_pct": 0,  "max_occupancy_pct": 20,  "discount_pct": 8,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium", "max_recovery_pct": 60 },
        { "min_occupancy_pct": 20, "max_occupancy_pct": 40,  "discount_pct": 9,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium", "max_recovery_pct": 60 }
      ]
    },
    {
      "name": "Moderato",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 15,
      "max_occupancy_pct": 30,
      "occupancy_mode": "pct",
      "discount_pct": 15,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": [
        { "min_occupancy_pct": 0,  "max_occupancy_pct": 20,  "discount_pct": 8,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium", "max_recovery_pct": 60 },
        { "min_occupancy_pct": 20, "max_occupancy_pct": 40,  "discount_pct": 8,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium", "max_recovery_pct": 60 },
        { "min_occupancy_pct": 40, "max_occupancy_pct": 60,  "discount_pct": 8,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium", "max_recovery_pct": 60 }
      ]
    },
    {
      "name": "Medio",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 30,
      "max_occupancy_pct": 50,
      "occupancy_mode": "pct",
      "discount_pct": 20,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": [
        { "min_occupancy_pct": 0,   "max_occupancy_pct": 20,  "discount_pct": 6,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "very_fast", "max_recovery_pct": 60 },
        { "min_occupancy_pct": 20,  "max_occupancy_pct": 40,  "discount_pct": 9,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "fast",      "max_recovery_pct": 60 },
        { "min_occupancy_pct": 40,  "max_occupancy_pct": 60,  "discount_pct": 10, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 },
        { "min_occupancy_pct": 60,  "max_occupancy_pct": 80,  "discount_pct": 12, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "slow",      "max_recovery_pct": 60 },
        { "min_occupancy_pct": 80,  "max_occupancy_pct": 100, "discount_pct": 14, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "slow",      "max_recovery_pct": 60 }
      ]
    },
    {
      "name": "Forte",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 50,
      "max_occupancy_pct": 70,
      "occupancy_mode": "pct",
      "discount_pct": 30,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": [
        { "min_occupancy_pct": 0,   "max_occupancy_pct": 20,  "discount_pct": 5,  "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "very_fast", "max_recovery_pct": 60 },
        { "min_occupancy_pct": 20,  "max_occupancy_pct": 40,  "discount_pct": 10, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "fast",      "max_recovery_pct": 60 },
        { "min_occupancy_pct": 40,  "max_occupancy_pct": 60,  "discount_pct": 15, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 },
        { "min_occupancy_pct": 60,  "max_occupancy_pct": 80,  "discount_pct": 20, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 },
        { "min_occupancy_pct": 80,  "max_occupancy_pct": 100, "discount_pct": 22, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 }
      ]
    },
    {
      "name": "Aggressivo (quasi vuoto)",
      "color": "#6b7280",
      "intensity": 5,
      "min_occupancy_pct": 70,
      "max_occupancy_pct": 100,
      "occupancy_mode": "pct",
      "discount_pct": 50,
      "discount_mode": "pct",
      "discount_eur": 0,
      "occupancy_bands": [
        { "min_occupancy_pct": 0,   "max_occupancy_pct": 20,  "discount_pct": 25, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "fast",      "max_recovery_pct": 60 },
        { "min_occupancy_pct": 20,  "max_occupancy_pct": 40,  "discount_pct": 25, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 },
        { "min_occupancy_pct": 40,  "max_occupancy_pct": 60,  "discount_pct": 25, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "medium",    "max_recovery_pct": 60 },
        { "min_occupancy_pct": 60,  "max_occupancy_pct": 80,  "discount_pct": 25, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "slow",      "max_recovery_pct": 60 },
        { "min_occupancy_pct": 80,  "max_occupancy_pct": 100, "discount_pct": 35, "discount_mode": "pct", "occupancy_mode": "pct", "rate_growth_pct": 1, "rate_growth_speed": "slow",      "max_recovery_pct": 60 }
      ]
    }
  ]
  $json$::jsonb
)
ON CONFLICT (template_name) DO UPDATE
  SET description = EXCLUDED.description,
      levels      = EXCLUDED.levels,
      updated_at  = now();
