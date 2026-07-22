-- Migration: Populate rms_department_revenue from scidoo_raw_fiscal_production
-- This script extracts department and document type breakdown from Scidoo JSONB data

-- Clear existing data for fresh ETL
DELETE FROM rms_department_revenue WHERE source = 'scidoo';

-- Extract with department breakdown (when available)
INSERT INTO rms_department_revenue (
  hotel_id, date, department_name, revenue, document_type, 
  document_count, taxable_amount, source, created_at, updated_at
)
SELECT 
  sfp.hotel_id,
  sfp.date,
  COALESCE(dept->>'name', 'Rooms') as department_name,
  COALESCE((dept->>'amount')::numeric, 0) as revenue,
  doc->>'document_type' as document_type,
  1 as document_count,
  COALESCE((doc->>'taxable_base')::numeric, (doc->>'total')::numeric, 0) as taxable_amount,
  'scidoo' as source,
  now(),
  now()
FROM connectors.scidoo_raw_fiscal_production sfp,
  jsonb_array_elements(sfp.raw_data->'documents') AS doc,
  jsonb_array_elements(COALESCE(doc->'account_revenues', '[]'::jsonb)) AS dept
WHERE sfp.raw_data IS NOT NULL
  AND sfp.raw_data->'documents' IS NOT NULL
  AND doc->>'document_type' IS NOT NULL
  AND doc->'account_revenues' IS NOT NULL
  AND jsonb_array_length(doc->'account_revenues') > 0;

-- If account_revenues is empty/null, create summary rows by document_type
INSERT INTO rms_department_revenue (
  hotel_id, date, department_name, revenue, document_type, 
  document_count, taxable_amount, source, created_at, updated_at
)
SELECT 
  sfp.hotel_id,
  sfp.date,
  'Fatturato Generale' as department_name,
  (doc->>'total')::numeric as revenue,
  doc->>'document_type' as document_type,
  1 as document_count,
  COALESCE((doc->>'taxable_base')::numeric, (doc->>'total')::numeric, 0) as taxable_amount,
  'scidoo' as source,
  now(),
  now()
FROM connectors.scidoo_raw_fiscal_production sfp,
  jsonb_array_elements(sfp.raw_data->'documents') AS doc
WHERE sfp.raw_data IS NOT NULL
  AND sfp.raw_data->'documents' IS NOT NULL
  AND doc->>'document_type' IS NOT NULL
  AND (doc->'account_revenues' IS NULL OR jsonb_array_length(doc->'account_revenues') = 0);
