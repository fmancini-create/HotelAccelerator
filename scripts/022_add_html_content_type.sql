-- Add 'html' as allowed content_type for messages
-- This allows storing email HTML content properly

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages ADD CONSTRAINT messages_content_type_check 
  CHECK (content_type IN ('text', 'html', 'image', 'file', 'audio', 'video', 'location'));
