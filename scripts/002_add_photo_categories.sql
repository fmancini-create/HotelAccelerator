-- Create pivot table to link photos with categories
CREATE TABLE IF NOT EXISTS photo_category (
  photo_id uuid REFERENCES photos(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (photo_id, category_id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_photo_category_photo ON photo_category(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_category_category ON photo_category(category_id);

-- Enable RLS
ALTER TABLE photo_category ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Public can view photo categories" ON photo_category
  FOR SELECT USING (true);

-- Allow admin to manage
CREATE POLICY "Admins can manage photo categories" ON photo_category
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = auth.uid()
    )
  );
