-- Email channels: auto-fill 'name' from display_name/email_address when not provided.
-- Fixes OAuth callback (Gmail/Microsoft) that did not pass 'name' and tripped NOT NULL.
CREATE OR REPLACE FUNCTION public.email_channels_default_name()
RETURNS trigger AS $$
BEGIN
  IF NEW.name IS NULL OR NEW.name = '' THEN
    NEW.name := COALESCE(NULLIF(NEW.display_name, ''), NEW.email_address);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_channels_default_name ON public.email_channels;
CREATE TRIGGER trg_email_channels_default_name
  BEFORE INSERT OR UPDATE ON public.email_channels
  FOR EACH ROW EXECUTE FUNCTION public.email_channels_default_name();
