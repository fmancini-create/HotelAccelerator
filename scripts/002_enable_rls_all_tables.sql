-- =====================================================
-- MIGRATION: Enable RLS on ALL tables for proper tenant isolation
-- Run this ONCE to secure the database
-- =====================================================

-- 1. ADMIN_USERS - Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Super admins can delete admin users" ON admin_users;
DROP POLICY IF EXISTS "Super admins can update admin users" ON admin_users;
DROP POLICY IF EXISTS "Admin users can view all admin users" ON admin_users;
DROP POLICY IF EXISTS "Allow insert for first setup or super admins" ON admin_users;

-- Create proper tenant-isolated policies
CREATE POLICY "admin_users_select_own_property" ON admin_users
  FOR SELECT USING (
    property_id IN (
      SELECT property_id FROM admin_users WHERE email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

CREATE POLICY "admin_users_insert_super_admin" ON admin_users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
    OR NOT EXISTS (SELECT 1 FROM admin_users)
  );

CREATE POLICY "admin_users_update_own_property" ON admin_users
  FOR UPDATE USING (
    property_id IN (
      SELECT property_id FROM admin_users 
      WHERE email = auth.jwt() ->> 'email' AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

CREATE POLICY "admin_users_delete_super_admin" ON admin_users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- 2. EMBED_SCRIPTS - Enable RLS
ALTER TABLE embed_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embed_scripts_tenant_isolation" ON embed_scripts
  FOR ALL USING (
    property_id IN (
      SELECT property_id FROM admin_users WHERE email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- Public can read active embed scripts by ID (for script loading)
CREATE POLICY "embed_scripts_public_read" ON embed_scripts
  FOR SELECT USING (status = 'active');

-- 3. COMMAND_LOGS - Enable RLS
ALTER TABLE command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "command_logs_tenant_isolation" ON command_logs
  FOR ALL USING (
    property_id IN (
      SELECT property_id FROM admin_users WHERE email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- 4. PLATFORM_COLLABORATORS - Enable RLS (super admin only)
ALTER TABLE platform_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_collaborators_super_admin_only" ON platform_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- Allow first collaborator creation when table is empty
CREATE POLICY "platform_collaborators_first_setup" ON platform_collaborators
  FOR INSERT WITH CHECK (
    NOT EXISTS (SELECT 1 FROM platform_collaborators)
  );

-- 5. PROPERTIES - Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Drop existing policy
DROP POLICY IF EXISTS "Full access properties" ON properties;

-- Admins can access their properties
CREATE POLICY "properties_admin_access" ON properties
  FOR ALL USING (
    id IN (
      SELECT property_id FROM admin_users WHERE email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM platform_collaborators 
      WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- Public can read basic property info for subdomain/domain resolution
CREATE POLICY "properties_public_read" ON properties
  FOR SELECT USING (is_active = true);

-- =====================================================
-- ADD INDEXES for property_id on all tables
-- This dramatically improves query performance for tenant-filtered queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_admin_users_property_id ON admin_users(property_id);
CREATE INDEX IF NOT EXISTS idx_categories_property_id ON categories(property_id);
CREATE INDEX IF NOT EXISTS idx_channel_settings_property_id ON channel_settings(property_id);
CREATE INDEX IF NOT EXISTS idx_cms_pages_property_id ON cms_pages(property_id);
CREATE INDEX IF NOT EXISTS idx_command_logs_property_id ON command_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_contacts_property_id ON contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_conversations_property_id ON conversations(property_id);
CREATE INDEX IF NOT EXISTS idx_email_channel_assignments_property_id ON email_channel_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_email_channels_property_id ON email_channels(property_id);
CREATE INDEX IF NOT EXISTS idx_email_labels_property_id ON email_labels(property_id);
CREATE INDEX IF NOT EXISTS idx_embed_scripts_property_id ON embed_scripts(property_id);
CREATE INDEX IF NOT EXISTS idx_events_property_id ON events(property_id);
CREATE INDEX IF NOT EXISTS idx_message_impressions_property_id ON message_impressions(property_id);
CREATE INDEX IF NOT EXISTS idx_message_rules_property_id ON message_rules(property_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_property_id ON message_templates(property_id);
CREATE INDEX IF NOT EXISTS idx_messages_property_id ON messages(property_id);
CREATE INDEX IF NOT EXISTS idx_photos_property_id ON photos(property_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_conversations_property_status ON conversations(property_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_property_channel ON conversations(property_id, channel);
CREATE INDEX IF NOT EXISTS idx_messages_property_conversation ON messages(property_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_events_property_type ON events(property_id, event_type);
CREATE INDEX IF NOT EXISTS idx_cms_pages_property_slug ON cms_pages(property_id, slug);

-- =====================================================
-- VERIFICATION QUERY - Run after migration to verify
-- =====================================================
-- SELECT 
--   schemaname, 
--   tablename, 
--   rowsecurity as rls_enabled
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename;
