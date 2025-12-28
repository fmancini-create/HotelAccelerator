-- TASK 1: Identità messaggi con UNIQUE constraint
-- TASK 2: Idempotenza hard
-- TASK 4: Ordine temporale con received_at e stored_at
-- TASK 5: Stato messaggio esplicito

-- Add external_message_id column with UNIQUE constraint for idempotency
ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_message_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_message_id 
ON messages(external_message_id) WHERE external_message_id IS NOT NULL;

-- Add received_at for proper temporal ordering (when message was received by channel)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE;

-- Add stored_at for when message was saved in our DB
ALTER TABLE messages ADD COLUMN IF NOT EXISTS stored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add explicit message status: received, read, replied
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'received';

-- Add in_reply_to and references for threading reconstruction
ALTER TABLE messages ADD COLUMN IF NOT EXISTS in_reply_to VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_references TEXT;

-- Add normalized_subject for threading fallback
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS normalized_subject VARCHAR(500);

-- Add internal_thread_id for DB-only threading (independent from Gmail)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_thread_id UUID DEFAULT gen_random_uuid();

-- Create index for threading by normalized subject
CREATE INDEX IF NOT EXISTS idx_conversations_normalized_subject 
ON conversations(property_id, normalized_subject) WHERE normalized_subject IS NOT NULL;

-- Create index for threading by internal_thread_id
CREATE INDEX IF NOT EXISTS idx_conversations_internal_thread_id 
ON conversations(internal_thread_id);

-- Create index for temporal ordering
CREATE INDEX IF NOT EXISTS idx_messages_received_at 
ON messages(conversation_id, received_at DESC);

-- TASK 7: Log table for message processing
CREATE TABLE IF NOT EXISTS message_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  external_message_id VARCHAR(255),
  channel VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- received, processed, error, duplicate_ignored
  event_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_processing_logs_external_id 
ON message_processing_logs(external_message_id);

CREATE INDEX IF NOT EXISTS idx_message_processing_logs_created 
ON message_processing_logs(property_id, created_at DESC);

-- Enable RLS on message_processing_logs
ALTER TABLE message_processing_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_processing_logs_tenant" ON message_processing_logs
  FOR ALL USING (
    property_id IN (
      SELECT property_id FROM admin_users WHERE id = auth.uid()
    )
  );

-- Update existing messages: set received_at from created_at if null
UPDATE messages SET received_at = created_at WHERE received_at IS NULL;

-- Update existing messages: set external_message_id from gmail_id if null
UPDATE messages SET external_message_id = gmail_id WHERE external_message_id IS NULL AND gmail_id IS NOT NULL;

-- Update existing messages: set stored_at from created_at if null
UPDATE messages SET stored_at = created_at WHERE stored_at IS NULL;
