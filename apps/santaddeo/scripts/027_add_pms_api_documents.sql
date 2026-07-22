-- Aggiunge tabella per memorizzare i documenti API dei PMS
CREATE TABLE IF NOT EXISTS public.pms_api_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pms_provider_id UUID NOT NULL REFERENCES public.pms_providers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  content_text TEXT,
  parsed_endpoints JSONB DEFAULT '[]',
  parsed_capabilities JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);

-- Indice per recuperare documenti per provider
CREATE INDEX IF NOT EXISTS idx_pms_api_documents_provider ON public.pms_api_documents(pms_provider_id);

-- RLS policies
ALTER TABLE public.pms_api_documents ENABLE ROW LEVEL SECURITY;

-- Solo superadmin possono vedere/modificare i documenti
CREATE POLICY "Superadmin can manage pms_api_documents" ON public.pms_api_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'superadmin'
    )
  );
