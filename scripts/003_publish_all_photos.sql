-- Publish all existing photos so they appear on the frontend
UPDATE photos 
SET is_published = true 
WHERE is_published = false;

-- Verify the update
SELECT 
  COUNT(*) as total_photos,
  SUM(CASE WHEN is_published THEN 1 ELSE 0 END) as published,
  SUM(CASE WHEN NOT is_published THEN 1 ELSE 0 END) as unpublished
FROM photos;
