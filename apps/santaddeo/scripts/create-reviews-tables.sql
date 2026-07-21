-- Reviews tables + reputation score view
-- Idempotent: safe to re-run without data loss
-- NB: we use IF NOT EXISTS everywhere, and DROP VIEW before CREATE to allow
-- structural changes to the view without affecting the data tables.

-- ---------------------------------------------------------------------------
-- 1) hotel_reviews — one row per review across all platforms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,            -- google | booking.com | tripadvisor | expedia | ...
  review_id    TEXT NOT NULL,            -- platform-side id (from Apify)
  author_name  TEXT,
  rating       NUMERIC(3,2),             -- always normalized to 1..5 scale
  original_rating NUMERIC(5,2),          -- raw value from source (may be 1..10)
  original_scale INT,                    -- 5 or 10
  title        TEXT,
  text         TEXT,
  language     TEXT,
  review_date  DATE,                     -- date the guest left the review
  stay_date    DATE,                     -- date of stay (when available)
  response_text TEXT,                    -- hotel's reply
  response_date DATE,
  sentiment    TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  topics       JSONB DEFAULT '[]'::jsonb, -- array of strings e.g. ["cleanliness","wifi"]
  raw_data     JSONB,                    -- full Apify item, for forensic lookups
  source       TEXT DEFAULT 'apify',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, platform, review_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_reviews_hotel_date
  ON hotel_reviews(hotel_id, review_date DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_reviews_hotel_platform
  ON hotel_reviews(hotel_id, platform);
CREATE INDEX IF NOT EXISTS idx_hotel_reviews_rating
  ON hotel_reviews(hotel_id, rating);

-- ---------------------------------------------------------------------------
-- 2) review_stats — daily snapshot of aggregate stats per hotel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_stats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  snapshot_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  total_reviews  INT  NOT NULL DEFAULT 0,
  avg_rating     NUMERIC(3,2),
  per_platform   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "google": { "count": 120, "avg_rating": 4.7 }, "booking.com": { ... } }
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_review_stats_hotel_date
  ON review_stats(hotel_id, snapshot_date DESC);

-- ---------------------------------------------------------------------------
-- 3) review_ai_insights — cached AI analysis (strengths / weaknesses / topics)
--    Rebuilt at most once every 24h to keep OpenAI cost low
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_ai_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviews_count   INT,
  lookback_days   INT,
  strengths       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ topic, count, sample_quote }]
  weaknesses      JSONB NOT NULL DEFAULT '[]'::jsonb,
  recurring_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary         TEXT,
  model           TEXT,
  input_tokens    INT,
  output_tokens   INT,
  UNIQUE (hotel_id)
);

-- ---------------------------------------------------------------------------
-- 4) reputation_scores_v — live view consumed by the K-driven algorithm
--
-- Formula (0..10):
--   1. base       = avg rating on reviews <= 180 days, weighted by recency
--                   (each review has weight exp(-age_days / 90))
--   2. base_norm  = ((base - 2.5) / 2.0) * 10, clamped to [0, 10]
--                   (so 2.5 star = 0, 4.5 star = 10, 3.5 star = 5)
--   3. trend      = avg(last 30d) − avg(60-90d previous), scaled:
--                   trend_bonus = clamp(trend * 3, -1.5, +1.5)
--                   (empirical: a ~0.5 star delta between the two windows
--                    corresponds to a 1.5 point bonus/malus)
--   4. volume_penalty =
--        -2.0 if reviews_180d < 5
--        -1.0 if reviews_180d < 10
--         0   otherwise
--   5. score = clamp(base_norm + trend_bonus + volume_penalty, 0, 10)
--
-- The view also exposes the individual components so the UI can explain
-- WHY the score is what it is, which is important for transparency.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS reputation_scores_v;
CREATE VIEW reputation_scores_v AS
WITH recent AS (
  SELECT
    hotel_id,
    rating,
    review_date,
    (CURRENT_DATE - review_date)::numeric AS age_days -- result is an integer number of days
  FROM hotel_reviews
  WHERE review_date IS NOT NULL
    AND review_date >= CURRENT_DATE - INTERVAL '180 days'
    AND rating IS NOT NULL
),
weighted AS (
  SELECT
    hotel_id,
    SUM(rating * EXP(-age_days / 90.0)) / NULLIF(SUM(EXP(-age_days / 90.0)), 0)
      AS base_rating,
    COUNT(*) AS reviews_180d,
    AVG(rating) FILTER (WHERE age_days <= 30)  AS rating_30d,
    AVG(rating) FILTER (WHERE age_days BETWEEN 60 AND 90) AS rating_60_90d
  FROM recent
  GROUP BY hotel_id
)
SELECT
  h.id AS hotel_id,
  COALESCE(w.reviews_180d, 0) AS reviews_180d,
  w.base_rating,
  w.rating_30d,
  w.rating_60_90d,

  -- base_norm: (avg-2.5)/2 * 10 clamped to [0,10]
  GREATEST(0, LEAST(10,
    ((COALESCE(w.base_rating, 0) - 2.5) / 2.0) * 10
  )) AS base_norm,

  -- trend_bonus: clamp(trend*3, -1.5, +1.5), null-safe
  GREATEST(-1.5, LEAST(1.5,
    COALESCE(w.rating_30d - w.rating_60_90d, 0) * 3
  )) AS trend_bonus,

  -- volume penalty
  CASE
    WHEN COALESCE(w.reviews_180d, 0) < 5  THEN -2.0
    WHEN COALESCE(w.reviews_180d, 0) < 10 THEN -1.0
    ELSE 0.0
  END AS volume_penalty,

  -- final score (null if no reviews at all)
  CASE
    WHEN w.base_rating IS NULL THEN NULL
    ELSE GREATEST(0, LEAST(10,
      ((w.base_rating - 2.5) / 2.0) * 10
      + GREATEST(-1.5, LEAST(1.5, COALESCE(w.rating_30d - w.rating_60_90d, 0) * 3))
      + CASE
          WHEN w.reviews_180d < 5  THEN -2.0
          WHEN w.reviews_180d < 10 THEN -1.0
          ELSE 0.0
        END
    ))
  END AS score
FROM hotels h
LEFT JOIN weighted w ON w.hotel_id = h.id;

COMMENT ON VIEW reputation_scores_v IS
  'Live reputation score (0..10) fed into the K-driven pricing algorithm. See the CTE comments for formula details.';
