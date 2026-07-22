import { readFileSync, writeFileSync } from 'fs';

const HOTEL_ID = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca';

const MONTH_MAP = {
  'Gen': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
  'Mag': '05', 'Giu': '06', 'Lug': '07', 'Ago': '08',
  'Set': '09', 'Ott': '10', 'Nov': '11', 'Dic': '12'
};

function parseItalianDate(str) {
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

function parseCsvToValues(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const values = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 18) continue;
    const dateStr = parseItalianDate(cols[1]);
    if (!dateStr) continue;
    const roomsOcc = Math.round(parseNumber(cols[2]));
    const totalRooms = Math.round(parseNumber(cols[3]));
    const occupancy = parseNumber(cols[6]);
    const pernotto = parseNumber(cols[11]);
    const revpar = parseNumber(cols[15]);
    const adr = parseNumber(cols[16]);
    if (totalRooms === 0) continue;
    const available = Math.max(0, totalRooms - roomsOcc);
    values.push(`('${HOTEL_ID}','${dateStr}',${totalRooms},${roomsOcc},${available},${pernotto},${adr},${revpar},${occupancy},'scidoo_csv_import',true,NOW(),NOW())`);
  }
  return values;
}

const v2024 = parseCsvToValues('/vercel/share/v0-project/scripts/2024.csv');
const v2025 = parseCsvToValues('/vercel/share/v0-project/scripts/2025.csv');
const all = [...v2024, ...v2025];

// Split into batches of 50 for SQL
const batchSize = 50;
let sql = '';
for (let i = 0; i < all.length; i += batchSize) {
  const batch = all.slice(i, i + batchSize);
  sql += `INSERT INTO daily_production (hotel_id,date,total_rooms,rooms_occupied,rooms_available,total_revenue,adr,revpar,occupancy_rate,source,is_frozen,created_at,updated_at) VALUES\n`;
  sql += batch.join(',\n');
  sql += `\nON CONFLICT (hotel_id, date) DO UPDATE SET total_rooms=EXCLUDED.total_rooms,rooms_occupied=EXCLUDED.rooms_occupied,rooms_available=EXCLUDED.rooms_available,total_revenue=EXCLUDED.total_revenue,adr=EXCLUDED.adr,revpar=EXCLUDED.revpar,occupancy_rate=EXCLUDED.occupancy_rate,source=EXCLUDED.source,is_frozen=EXCLUDED.is_frozen,updated_at=NOW();\n\n`;
}

writeFileSync('/vercel/share/v0-project/scripts/import-2024-2025.sql', sql);
console.log(`Generated SQL with ${all.length} rows (${v2024.length} from 2024, ${v2025.length} from 2025)`);
