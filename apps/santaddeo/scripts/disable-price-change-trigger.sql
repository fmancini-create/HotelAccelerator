-- Disable the trigger that causes duplicate logging
-- The API route /api/accelerator/pricing-grid already handles price_change_log inserts
-- with better context (source, changed_by, etc.)
-- This trigger was causing duplicate entries for every price change.

DROP TRIGGER IF EXISTS trg_price_change_log ON pricing_grid;

-- Keep the function in case we need it later, just remove the trigger
-- DROP FUNCTION IF EXISTS fn_log_price_change();
