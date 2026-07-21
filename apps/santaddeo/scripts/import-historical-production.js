import { readFileSync } from 'fs';
import { resolve } from 'path';

const HOTEL_ID = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MONTH_MAP = {
  'Gen': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
  'Mag': '05', 'Giu': '06', 'Lug': '07', 'Ago': '08',
  'Set': '09', 'Ott': '10', 'Nov': '11', 'Dic': '12'
};

function parseItalianDate(str) {
  // "Lu 01 Gen 2024" -> "2024-01-01"
  const clean = str.replace(/"/g, '').trim();
  const parts = clean.split(' ');
  if (parts.length < 4) return null;
  const day = parts[1].padStart(2, '0');
  const month = MONTH_MAP[parts[2]];
  const year = parts[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function parseNumber(str) {
  if (!str || str === '---') return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function parseCsv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 18) continue;
    
    const dateStr = parseItalianDate(cols[1]);
    if (!dateStr) continue;
    
    const roomsOccupied = parseNumber(cols[2]);
    const totalRooms = parseNumber(cols[3]);
    const occupancy = parseNumber(cols[6]);
    const pernotto = parseNumber(cols[11]); // Pernotto = room revenue
    const revpar = parseNumber(cols[15]);
    const adr = parseNumber(cols[16]);

    if (totalRooms === 0) continue;

    rows.push({
      hotel_id: HOTEL_ID,
      date: dateStr,
      total_rooms: Math.round(totalRooms),
      rooms_occupied: Math.round(roomsOccupied),
      rooms_available: Math.max(0, Math.round(totalRooms) - Math.round(roomsOccupied)),
      total_revenue: pernotto,
      adr: adr,
      revpar: revpar,
      occupancy_rate: occupancy,
      source: 'scidoo_csv_import',
      is_frozen: true,
    });
  }
  return rows;
}

async function upsertBatch(rows) {
  const batchSize = 100;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_production`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Error batch ${i}: ${err}`);
    } else {
      total += batch.length;
      console.log(`Upserted ${total}/${rows.length} rows`);
    }
  }
  return total;
}

async function main() {
  console.log('Parsing 2024 CSV...');
  const rows2024 = parseCsv(resolve(import.meta.dirname, '2024.csv'));
  console.log(`Parsed ${rows2024.length} rows for 2024 (${rows2024[0]?.date} - ${rows2024[rows2024.length-1]?.date})`);
  
  console.log('Parsing 2025 CSV...');
  const rows2025 = parseCsv(resolve(import.meta.dirname, '2025.csv'));
  console.log(`Parsed ${rows2025.length} rows for 2025 (${rows2025[0]?.date} - ${rows2025[rows2025.length-1]?.date})`);

  const allRows = [...rows2024, ...rows2025];
  console.log(`Total: ${allRows.length} rows to upsert`);

  console.log('Sample 2024-01-01:', JSON.stringify(rows2024[0]));
  console.log('Sample 2025-01-01:', JSON.stringify(rows2025[0]));

  console.log('\nUpserting to daily_production...');
  const total = await upsertBatch(allRows);
  console.log(`\nDone! Upserted ${total} rows total.`);
}

main().catch(console.error);
