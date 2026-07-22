-- Create info_requests table for storing contact form submissions
CREATE TABLE IF NOT EXISTS public.info_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  notes TEXT
);

-- Add RLS policies
ALTER TABLE public.info_requests ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert and select
CREATE POLICY "Service role can manage info_requests" ON public.info_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_info_requests_created_at ON public.info_requests(created_at DESC);
