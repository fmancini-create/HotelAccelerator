-- 032: Create user_invitations table for team invite flow
-- This table stores pending invitations sent by admins to new team members

CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'sub_user',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  invited_by_name text,
  hotel_name text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id)
);

-- Index for fast lookups by token (used during accept flow)
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token);

-- Index for listing pending invitations per hotel
CREATE INDEX IF NOT EXISTS idx_user_invitations_hotel ON user_invitations(hotel_id, accepted_at);

-- Index for checking if email already invited
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email, hotel_id);
