-- Create normalized table for department revenue data
-- Some PMS providers (e.g. future integrations) may provide per-department revenue breakdowns.
-- Scidoo does NOT provide this data (account_revenues is always null).
-- This table is ready for PMS providers that do support it.

CREATE TABLE IF NOT EXISTS rms_department_revenue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  date date NOT NULL,
  department_name text NOT NULL,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  document_type text, -- 'fee', 'invoice', 'credit_note', etc.
  document_count integer DEFAULT 0,
  taxable_amount numeric(12,2),
  source text NOT NULL DEFAULT 'pms', -- 'pms', 'manual', 'gsheets'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, date, department_name, document_type)
);

-- Index for fast lookups by hotel + date range
CREATE INDEX IF NOT EXISTS idx_rms_dept_rev_hotel_date 
ON rms_department_revenue(hotel_id, date);

-- RLS
ALTER TABLE rms_department_revenue ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all" ON rms_department_revenue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow authenticated users to read their hotel's data
CREATE POLICY "users_read_own_hotel" ON rms_department_revenue
  FOR SELECT TO authenticated
  USING (
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );
