-- 210_machine_senders_and_contact_dedup.sql
--
-- Three linked changes, in a mandatory order:
--
--   1. Denormalise the sender onto `conversations` (contact_email/contact_name)
--      so a conversation can exist without a CRM contact.
--   2. Unlink automated senders (noreply@, notifications@, ...) from the CRM
--      and delete those contact rows. Conversations and messages are KEPT.
--   3. Merge the remaining duplicate contacts / conversations and only then add
--      the unique indexes: Postgres refuses to build a unique index on data
--      that is still duplicated.
--
-- The machine-sender pattern below is a verbatim copy of
-- MACHINE_LOCAL_PART_PATTERN in lib/crm/machine-sender.ts. The two are
-- cross-checked by comparing row counts after this script runs; if they ever
-- diverge, the check fails loudly instead of drifting in silence.

-- ---------------------------------------------------------------------------
-- 1. Denormalised sender columns
-- ---------------------------------------------------------------------------

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_name text;

COMMENT ON COLUMN conversations.contact_email IS
  'Sender address, denormalised. Authoritative when contact_id is NULL (automated senders).';
COMMENT ON COLUMN conversations.contact_name IS
  'Sender display name, denormalised. Authoritative when contact_id is NULL.';

-- Backfill from the linked contact.
UPDATE conversations c
SET contact_email = ct.email,
    contact_name  = COALESCE(c.contact_name, ct.name)
FROM contacts ct
WHERE c.contact_id = ct.id
  AND c.contact_email IS NULL;

-- Backfill anything still missing from the oldest inbound message headers, so
-- no conversation is left without a sender to display.
UPDATE conversations c
SET contact_email = COALESCE(c.contact_email, src.addr),
    contact_name  = COALESCE(c.contact_name, NULLIF(src.display, ''))
FROM (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         lower(COALESCE(
           substring(m.metadata->>'from' FROM '<([^>]+)>'),
           NULLIF(trim(m.metadata->>'from'), '')
         )) AS addr,
         trim(both '" ' FROM split_part(COALESCE(m.metadata->>'from', ''), '<', 1)) AS display
  FROM messages m
  WHERE m.sender_type = 'customer'
    AND m.metadata->>'from' IS NOT NULL
  ORDER BY m.conversation_id, m.received_at NULLS LAST, m.created_at
) src
WHERE c.id = src.conversation_id
  AND c.contact_email IS NULL
  AND src.addr IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Automated senders leave the CRM (their mail stays in the Inbox)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE machine_contacts ON COMMIT DROP AS
SELECT id
FROM contacts
WHERE email IS NOT NULL
  AND email <> ''
  AND split_part(lower(email), '@', 1) ~ '(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreplay|non-?rispondere|mailer-?daemon|postmaster|bounce|bounces|notification|notifications|notifica|notifiche|newsletter|digest|alert|alerts|avvisi|automated|automatic|automatico|automatica|auto-?mail|mailer|mailing|no-?answer|unsubscribe|invio-?automatico|comunicazioni)([._+-]|$)';

-- Safety net: never unlink a conversation whose sender we could not preserve.
UPDATE conversations c
SET contact_email = COALESCE(c.contact_email, ct.email),
    contact_name  = COALESCE(c.contact_name, ct.name)
FROM contacts ct
WHERE c.contact_id = ct.id
  AND ct.id IN (SELECT id FROM machine_contacts);

UPDATE conversations
SET contact_id = NULL
WHERE contact_id IN (SELECT id FROM machine_contacts);

-- messages.sender_id has no foreign key, so deleting the contact would leave a
-- dangling pointer instead of failing. Clear it explicitly.
UPDATE messages
SET sender_id = NULL
WHERE sender_id IN (SELECT id FROM machine_contacts);

DELETE FROM contacts WHERE id IN (SELECT id FROM machine_contacts);

-- ---------------------------------------------------------------------------
-- 3a. Merge duplicate contacts (same tenant, same address)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE contact_merge ON COMMIT DROP AS
SELECT c.id AS loser_id,
       first_value(c.id) OVER (
         PARTITION BY c.property_id, lower(c.email)
         ORDER BY c.created_at, c.id
       ) AS winner_id
FROM contacts c
WHERE c.email IS NOT NULL
  AND c.email <> ''
  AND c.property_id IS NOT NULL;

DELETE FROM contact_merge WHERE loser_id = winner_id;

UPDATE conversations SET contact_id = m.winner_id
FROM contact_merge m WHERE conversations.contact_id = m.loser_id;

UPDATE messages SET sender_id = m.winner_id
FROM contact_merge m WHERE messages.sender_id = m.loser_id;

UPDATE contact_date_requests SET contact_id = m.winner_id
FROM contact_merge m WHERE contact_date_requests.contact_id = m.loser_id;

UPDATE events SET contact_id = m.winner_id
FROM contact_merge m WHERE events.contact_id = m.loser_id;

UPDATE tracking_sessions SET contact_id = m.winner_id
FROM contact_merge m WHERE tracking_sessions.contact_id = m.loser_id;

UPDATE contact_stays SET contact_id = m.winner_id
FROM contact_merge m WHERE contact_stays.contact_id = m.loser_id;

-- These two can carry a (parent, contact) uniqueness: repoint only where the
-- winner is not already a member, then drop the now-redundant loser rows.
UPDATE contact_segment_members s SET contact_id = m.winner_id
FROM contact_merge m
WHERE s.contact_id = m.loser_id
  AND NOT EXISTS (
    SELECT 1 FROM contact_segment_members w
    WHERE w.contact_id = m.winner_id AND w.segment_id = s.segment_id
  );

UPDATE email_campaign_recipients r SET contact_id = m.winner_id
FROM contact_merge m
WHERE r.contact_id = m.loser_id
  AND NOT EXISTS (
    SELECT 1 FROM email_campaign_recipients w
    WHERE w.contact_id = m.winner_id AND w.campaign_id = r.campaign_id
  );

-- Remaining loser rows are exact duplicates of the winner's; CASCADE clears
-- them together with the contact.
DELETE FROM contacts WHERE id IN (SELECT loser_id FROM contact_merge);

-- ---------------------------------------------------------------------------
-- 3b. Merge duplicate conversations (same tenant, same Gmail thread)
-- ---------------------------------------------------------------------------
-- The winner is the row that already owns messages; ties go to the oldest.
-- Messages must be repointed BEFORE the delete: the FK is ON DELETE CASCADE,
-- so dropping a conversation first would take its messages with it.

CREATE TEMP TABLE conversation_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT c.id,
         c.property_id,
         c.gmail_thread_id,
         first_value(c.id) OVER (
           PARTITION BY c.property_id, c.gmail_thread_id
           ORDER BY (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) DESC,
                    c.created_at,
                    c.id
         ) AS winner_id
  FROM conversations c
  WHERE c.gmail_thread_id IS NOT NULL
    AND c.property_id IS NOT NULL
)
SELECT id AS loser_id, winner_id FROM ranked;

DELETE FROM conversation_merge WHERE loser_id = winner_id;

UPDATE messages SET conversation_id = m.winner_id
FROM conversation_merge m WHERE messages.conversation_id = m.loser_id;

UPDATE contact_date_requests SET conversation_id = m.winner_id
FROM conversation_merge m WHERE contact_date_requests.conversation_id = m.loser_id;

-- Keep the surviving thread's counters consistent with the merged messages.
UPDATE conversations w
SET unread_count = sub.unread_total,
    last_message_at = GREATEST(COALESCE(w.last_message_at, 'epoch'::timestamptz), sub.last_at),
    contact_id = COALESCE(w.contact_id, sub.any_contact),
    contact_email = COALESCE(w.contact_email, sub.any_email),
    contact_name = COALESCE(w.contact_name, sub.any_name)
FROM (
  SELECT m.winner_id,
         COALESCE(SUM(l.unread_count), 0) + COALESCE(MAX(x.unread_count), 0) AS unread_total,
         MAX(COALESCE(l.last_message_at, 'epoch'::timestamptz)) AS last_at,
         MIN(l.contact_id::text)::uuid AS any_contact,
         MIN(l.contact_email) AS any_email,
         MIN(l.contact_name) AS any_name
  FROM conversation_merge m
  JOIN conversations l ON l.id = m.loser_id
  JOIN conversations x ON x.id = m.winner_id
  GROUP BY m.winner_id
) sub
WHERE w.id = sub.winner_id;

DELETE FROM conversations WHERE id IN (SELECT loser_id FROM conversation_merge);

-- ---------------------------------------------------------------------------
-- 4. Unique indexes — the actual guarantee
-- ---------------------------------------------------------------------------
-- Without these, two concurrent writers (Pub/Sub webhook and the 5-minute
-- poller) can still pass the application-level "check then insert" and create
-- duplicates. The predicates are not cosmetic:
--   - `email <> ''` keeps the 2 blank-address contacts from colliding with each
--     other and being merged into one person.
--   - lower(email) is required, otherwise Mario@x.it and mario@x.it stay two
--     rows and the constraint guarantees nothing.

CREATE UNIQUE INDEX IF NOT EXISTS contacts_property_email_unique
  ON contacts (property_id, lower(email))
  WHERE email IS NOT NULL AND email <> '' AND property_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_property_gmail_thread_unique
  ON conversations (property_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL AND property_id IS NOT NULL;

-- Supports the contactless sender lookup in the threading fallback and the
-- Inbox sender sort/search.
CREATE INDEX IF NOT EXISTS conversations_property_contact_email_idx
  ON conversations (property_id, contact_email);
