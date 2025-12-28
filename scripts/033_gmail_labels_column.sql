-- Add gmail_labels column to conversations table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'gmail_labels'
  ) THEN
    ALTER TABLE conversations ADD COLUMN gmail_labels text[] DEFAULT '{}';
  END IF;
END $$;

-- Create index for gmail_labels for faster label-based queries
CREATE INDEX IF NOT EXISTS idx_conversations_gmail_labels ON conversations USING GIN (gmail_labels);

-- Update existing email conversations to have INBOX label if they don't have labels
UPDATE conversations 
SET gmail_labels = ARRAY['INBOX']
WHERE channel = 'email' 
  AND (gmail_labels IS NULL OR gmail_labels = '{}')
  AND status != 'spam';

-- Set SPAM label for spam conversations
UPDATE conversations 
SET gmail_labels = ARRAY['SPAM']
WHERE channel = 'email' 
  AND status = 'spam';
