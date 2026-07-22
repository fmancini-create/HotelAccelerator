-- Allow service_role to INSERT into scidoo_raw_fiscal_production
-- This fixes the fiscal sync job which was blocked by RLS
-- Note: DELETE is intentionally NOT allowed - raw tables must remain immutable

CREATE POLICY raw_fiscal_insert_service
ON connectors.scidoo_raw_fiscal_production
FOR INSERT
TO service_role
WITH CHECK (true);
