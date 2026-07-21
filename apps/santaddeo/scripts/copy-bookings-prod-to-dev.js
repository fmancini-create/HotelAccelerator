/**
 * Script: copy-bookings-prod-to-dev.mjs
 * Copia le bookings dalla produzione (aeynirkfixurikshxfov) al dev (dshdmkmhhbjractpvojp)
 * in batch da 500 record alla volta.
 *
 * Uso: node scripts/copy-bookings-prod-to-dev.mjs
 *
 * Richiede le env vars:
 *   PROD_SUPABASE_URL
 *   PROD_SUPABASE_SERVICE_KEY
 *   DEV_SUPABASE_URL
 *   DEV_SUPABASE_SERVICE_KEY
 */

const PROD_URL = process.env.SUPABASE_URL || 'https://aeynirkfixurikshxfov.supabase.co';
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_URL = process.env.DEV_SUPABASE_URL || 'https://dshdmkmhhbjractpvojp.supabase.co';
const DEV_KEY = process.env.DEV_SUPABASE_ANON_KEY;

const BATCH_SIZE = 500;
const COLUMNS = [
  'id', 'hotel_id', 'room_type_id', 'pms_booking_id', 'pms_reservation_number',
  'booking_date', 'booking_datetime', 'check_in_date', 'check_out_date',
  'is_cancelled', 'cancellation_date', 'cancellation_datetime', 'cancellation_reason',
  'booking_pickup_days', 'cancellation_pickup_days',
  'guest_name', 'guest_email', 'guest_phone', 'guest_country', 'guest_notes',
  'number_of_rooms', 'number_of_nights', 'number_of_guests',
  'price_per_night', 'total_price', 'channel', 'is_direct',
  'commission_rate', 'commission_amount', 'source',
  'imported_at', 'created_at', 'updated_at', 'is_frozen', 'frozen_at'
];

async function fetchBatch(offset) {
  const url = `${PROD_URL}/rest/v1/bookings?select=${COLUMNS.join(',')}&order=created_at.asc&limit=${BATCH_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      'apikey': PROD_KEY,
      'Authorization': `Bearer ${PROD_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Errore fetch prod (offset=${offset}): ${res.status} ${err}`);
  }
  return res.json();
}

async function insertBatch(rows) {
  const url = `${DEV_URL}/rest/v1/bookings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': DEV_KEY,
      'Authorization': `Bearer ${DEV_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Errore insert dev: ${res.status} ${err}`);
  }
  return res;
}

async function main() {
  if (!PROD_KEY || !DEV_KEY) {
    console.error('Mancano le variabili SUPABASE_SERVICE_ROLE_KEY e/o DEV_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  // Conta totale bookings in produzione
  const countRes = await fetch(`${PROD_URL}/rest/v1/bookings?select=id`, {
    headers: {
      'apikey': PROD_KEY,
      'Authorization': `Bearer ${PROD_KEY}`,
      'Prefer': 'count=exact',
      'Range': '0-0',
    }
  });
  const contentRange = countRes.headers.get('content-range');
  const total = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
  console.log(`[v0] Totale bookings in produzione: ${total}`);

  let offset = 0;
  let copiati = 0;
  let errors = 0;

  while (offset < total) {
    try {
      const rows = await fetchBatch(offset);
      if (rows.length === 0) break;

      await insertBatch(rows);
      copiati += rows.length;
      console.log(`[v0] Copiati ${copiati}/${total} (batch offset=${offset}, size=${rows.length})`);
    } catch (err) {
      console.error(`[v0] Errore al batch offset=${offset}: ${err.message}`);
      errors++;
      if (errors > 5) {
        console.error('[v0] Troppi errori consecutivi, interrompo.');
        break;
      }
    }
    offset += BATCH_SIZE;

    // Piccola pausa per non sovraccaricare le API
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n[v0] === COMPLETATO ===`);
  console.log(`[v0] Bookings copiati: ${copiati}`);
  console.log(`[v0] Errori: ${errors}`);
}

main().catch(err => {
  console.error('[v0] Errore fatale:', err);
  process.exit(1);
});
