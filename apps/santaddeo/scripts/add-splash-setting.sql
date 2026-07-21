-- Add show_motivational_splash column to hotels table
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS show_motivational_splash BOOLEAN NOT NULL DEFAULT true;
