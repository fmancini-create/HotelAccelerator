-- FIX: Disable the price_change_log trigger on pricing_grid
-- The API route will be the ONLY point of truth for logging price changes.
-- This eliminates duplicate logging (API + trigger) and allows granular source tracking.

-- Drop the trigger
DROP TRIGGER IF EXISTS trg_price_change_log ON pricing_grid;

-- Optionally drop the function (uncomment if you want to remove it entirely)
-- DROP FUNCTION IF EXISTS fn_log_price_change();

-- Note: The price_change_log table and its data are preserved.
-- Only the automatic trigger is disabled.
