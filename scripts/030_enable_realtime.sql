-- Enable Realtime for inbox tables
-- This allows the frontend to receive instant updates when new messages arrive

-- Enable realtime on messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable realtime on conversations table  
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Verify realtime is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
