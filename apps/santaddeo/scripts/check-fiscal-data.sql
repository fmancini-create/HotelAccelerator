-- Check fiscal data status for Villa I Barronci (hotel_id: 8dd3f8c1-284a-43f1-b24f-e6a9d428edca)

-- 1. Check if connectors.scidoo_raw_fiscal_production exists and has data
SELECT 'connectors.scidoo_raw_fiscal_production' as table_name, 
       COUNT(*) as total_rows,
       MIN(date) as earliest_date,
       MAX(date) as latest_date
FROM connectors.scidoo_raw_fiscal_production
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';

-- 2. Check rms_daily_room_revenue for fiscal data
SELECT 'rms_daily_room_revenue' as table_name,
       COUNT(*) as total_rows,
       MIN(date) as earliest_date,
       MAX(date) as latest_date,
       SUM(total_revenue) as total_revenue_sum
FROM rms_daily_room_revenue
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';

-- 3. Check all hotels with fiscal data
SELECT h.name as hotel_name, 
       COUNT(r.*) as fiscal_records,
       MIN(r.date) as earliest,
       MAX(r.date) as latest
FROM hotels h
LEFT JOIN rms_daily_room_revenue r ON r.hotel_id = h.id
GROUP BY h.id, h.name
ORDER BY fiscal_records DESC;

-- 4. Check pms_integrations for Scidoo
SELECT h.name as hotel_name,
       p.pms_type,
       p.is_active,
       p.credentials->>'vat_number' as vat_number,
       p.last_sync_at
FROM pms_integrations p
JOIN hotels h ON h.id = p.hotel_id
WHERE p.pms_type = 'scidoo';
