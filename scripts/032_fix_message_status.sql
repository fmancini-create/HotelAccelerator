-- TASK 4: Fix existing messages status
-- Messages that have been opened (in conversations that have replies) should be 'replied'
-- Messages in conversations without replies should be 'read' if conversation was viewed

-- Step 1: Mark all customer messages as 'replied' if there's at least one agent reply in the conversation
UPDATE messages m
SET status = 'replied'
WHERE m.sender_type = 'customer'
  AND m.status IN ('received', 'read')
  AND EXISTS (
    SELECT 1 FROM messages reply 
    WHERE reply.conversation_id = m.conversation_id 
      AND reply.sender_type = 'agent'
      AND reply.created_at > m.created_at
  );

-- Step 2: Mark remaining customer messages as 'read' if conversation unread_count = 0
UPDATE messages m
SET status = 'read'
WHERE m.sender_type = 'customer'
  AND m.status = 'received'
  AND EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.id = m.conversation_id 
      AND c.unread_count = 0
  );

-- Verify results
SELECT status, COUNT(*) as count 
FROM messages 
WHERE sender_type = 'customer'
GROUP BY status;
