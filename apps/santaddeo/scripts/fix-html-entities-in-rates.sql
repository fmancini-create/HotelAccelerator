UPDATE rates SET name = REPLACE(name, '&amp;', '&') WHERE name LIKE '%&amp;%';
