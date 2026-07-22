import pg from "pg";

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'last_sent_prices') THEN
    CREATE TABLE last_sent_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hotel_id UUID NOT NULL,
      room_type_id UUID NOT NULL,
      rate_id UUID NOT NULL,
      occupancy INT NOT NULL DEFAULT 2,
      target_date DATE NOT NULL,
      last_price NUMERIC NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source TEXT NOT NULL DEFAULT 'manual_grid',
      UNIQUE(hotel_id, room_type_id, rate_id, occupancy, target_date)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_last_sent_prices_hotel_date
  ON last_sent_prices(hotel_id, target_date);
CREATE INDEX IF NOT EXISTS idx_last_sent_prices_lookup
  ON last_sent_prices(hotel_id, room_type_id, rate_id, occupancy, target_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='autopilot_configs' AND column_name='last_full_sync_at') THEN
    ALTER TABLE autopilot_configs ADD COLUMN last_full_sync_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='autopilot_configs' AND column_name='guard_tolerance_pct') THEN
    ALTER TABLE autopilot_configs ADD COLUMN guard_tolerance_pct NUMERIC DEFAULT 5.0;
  END IF;
END $$;

ALTER TABLE last_sent_prices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'last_sent_prices' AND policyname = 'Service role full access last_sent_prices') THEN
    CREATE POLICY "Service role full access last_sent_prices"
      ON last_sent_prices FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

try {
  await client.query(sql);
  console.log("Migration completed: last_sent_prices table + autopilot_configs columns");
} catch (err) {
  console.error("Migration error:", err.message);
} finally {
  await client.end();
}
