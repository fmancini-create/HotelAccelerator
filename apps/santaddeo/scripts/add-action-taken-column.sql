-- Add action_taken column to price_change_log to track if email/PMS was sent
ALTER TABLE price_change_log 
ADD COLUMN action_taken TEXT DEFAULT 'none' CHECK (action_taken IN ('none', 'email', 'pms'));

-- Create index for efficient filtering
CREATE INDEX idx_price_change_log_action_taken ON price_change_log(action_taken);

-- Add comment
COMMENT ON COLUMN price_change_log.action_taken IS 'Action taken after price change: none (disabled), email (notify), pms (autopilot)';
