-- Create command_logs table for structured logging
-- Tracks all write operations across the system

CREATE TABLE IF NOT EXISTS public.command_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID NOT NULL, -- References auth.users(id)
  property_id UUID NOT NULL, -- References properties(id)
  command_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('conversation', 'message', 'email_channel', 'message_rule')),
  entity_id TEXT NOT NULL,
  payload_summary JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  error_code TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying logs by property
CREATE INDEX idx_command_logs_property_id ON public.command_logs(property_id);

-- Index for querying logs by actor
CREATE INDEX idx_command_logs_actor_id ON public.command_logs(actor_id);

-- Index for querying logs by entity
CREATE INDEX idx_command_logs_entity ON public.command_logs(entity_type, entity_id);

-- Index for querying logs by timestamp
CREATE INDEX idx_command_logs_timestamp ON public.command_logs(timestamp DESC);

-- Index for querying failed commands
CREATE INDEX idx_command_logs_failures ON public.command_logs(result) WHERE result = 'failure';

-- No RLS for now - admin-only access to be configured later
ALTER TABLE public.command_logs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.command_logs IS 'Structured logs for all write operations - tracks who did what, when, and on which entity';
COMMENT ON COLUMN public.command_logs.actor_id IS 'User who executed the command (auth.uid)';
COMMENT ON COLUMN public.command_logs.property_id IS 'Property the command was executed on';
COMMENT ON COLUMN public.command_logs.command_name IS 'Name of the command (e.g., "mark_as_read", "create_channel")';
COMMENT ON COLUMN public.command_logs.entity_type IS 'Type of entity affected (conversation, message, email_channel, message_rule)';
COMMENT ON COLUMN public.command_logs.entity_id IS 'ID of the entity affected';
COMMENT ON COLUMN public.command_logs.payload_summary IS 'Sanitized payload summary (no PII, no sensitive data)';
COMMENT ON COLUMN public.command_logs.result IS 'Execution result (success or failure)';
COMMENT ON COLUMN public.command_logs.error_code IS 'Error code if command failed';
COMMENT ON COLUMN public.command_logs.duration_ms IS 'Command execution duration in milliseconds';
