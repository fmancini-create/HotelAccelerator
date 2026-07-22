-- Cleanup script for Villa I Barronci fiscal production data
-- Hotel ID: 8dd3f8c1-284a-43f1-b24f-e6a9d428edca
-- 
-- This script removes corrupted/incomplete data so that fresh sync can populate correct data

-- Step 1: Delete corrupted records from rms_department_revenue
DELETE FROM rms_department_revenue 
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';

-- Step 2: Delete corrupted records from connectors.scidoo_raw_fiscal_production
-- These records have NULL account_revenues and will be re-synced from Scidoo
DELETE FROM connectors.scidoo_raw_fiscal_production 
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';

-- Step 3: Delete daily_production records that came from scidoo (keep booking_etl ones)
DELETE FROM daily_production 
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca'
AND (source = 'scidoo' OR source = 'booking_etl+scidoo');

-- Verification queries (run after cleanup to confirm)
-- SELECT COUNT(*) FROM rms_department_revenue WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';
-- SELECT COUNT(*) FROM connectors.scidoo_raw_fiscal_production WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';
-- SELECT COUNT(*) FROM daily_production WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';
