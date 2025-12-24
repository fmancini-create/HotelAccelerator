-- =============================================
-- MULTICHANNEL MESSAGING SYSTEM
-- Chat Live, WhatsApp, Email - Inbox Unificata
-- =============================================

-- Tabella contatti (clienti)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_id TEXT, -- ID WhatsApp per matching
  language TEXT DEFAULT 'it',
  notes TEXT,
  tags TEXT[], -- es: ['vip', 'returning', 'complaint']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per ricerca veloce
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp ON contacts(whatsapp_id);

-- Tabella conversazioni
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('chat', 'whatsapp', 'email')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'spam')),
  assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  subject TEXT, -- Per email
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}', -- Dati extra (es: pagina di origine chat)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- Tabella messaggi
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'system')),
  sender_id UUID, -- admin_users.id se agent, NULL se customer
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'template')),
  attachments JSONB DEFAULT '[]', -- [{url, name, type, size}]
  metadata JSONB DEFAULT '{}', -- Dati extra (es: message_id WhatsApp)
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Tabella template messaggi
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('chat', 'whatsapp', 'email', 'all')),
  language TEXT DEFAULT 'it',
  subject TEXT, -- Per email
  content TEXT NOT NULL,
  variables TEXT[], -- es: ['nome', 'data_checkin', 'numero_camera']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella impostazioni canali
CREATE TABLE IF NOT EXISTS channel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL UNIQUE CHECK (channel IN ('chat', 'whatsapp', 'email')),
  is_enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  -- Chat: {welcome_message, offline_message, auto_reply}
  -- WhatsApp: {phone_number, business_id, access_token}
  -- Email: {from_email, from_name, smtp_settings}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserisci impostazioni default per i canali
INSERT INTO channel_settings (channel, is_enabled, settings) VALUES
  ('chat', true, '{
    "welcome_message": "Ciao! Come possiamo aiutarti?",
    "offline_message": "Siamo offline. Lascia un messaggio e ti risponderemo presto.",
    "auto_reply_enabled": false,
    "business_hours": {"start": "09:00", "end": "22:00"}
  }'),
  ('whatsapp', false, '{
    "phone_number": "",
    "business_id": "",
    "welcome_message": "Benvenuto su Villa I Barronci!"
  }'),
  ('email', true, '{
    "from_email": "info@ibarronci.it",
    "from_name": "Villa I Barronci",
    "signature": "Cordiali saluti,\nVilla I Barronci"
  }')
ON CONFLICT (channel) DO NOTHING;

-- Funzione per aggiornare last_message_at e unread_count
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_at = NEW.created_at,
    unread_count = CASE 
      WHEN NEW.sender_type = 'customer' THEN unread_count + 1 
      ELSE unread_count 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger per aggiornare conversazione
DROP TRIGGER IF EXISTS trigger_update_conversation ON messages;
CREATE TRIGGER trigger_update_conversation
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- RLS Policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Admin può vedere tutto
CREATE POLICY "Admins can manage contacts" ON contacts FOR ALL USING (true);
CREATE POLICY "Admins can manage conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "Admins can manage messages" ON messages FOR ALL USING (true);
CREATE POLICY "Admins can manage templates" ON message_templates FOR ALL USING (true);
CREATE POLICY "Admins can manage channel_settings" ON channel_settings FOR ALL USING (true);
