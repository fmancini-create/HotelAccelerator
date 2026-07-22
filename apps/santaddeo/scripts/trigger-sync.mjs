import fetch from 'node-fetch'

// Trigger Scidoo fiscal sync for Villa I Barronci
const hotelId = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca'
const dateFrom = '2026-03-01'
const dateTo = '2026-03-10'

// The API endpoint runs in the v0 preview
const apiUrl = `http://localhost:3000/api/scidoo/sync?hotel_id=${hotelId}&date_from=${dateFrom}&date_to=${dateTo}`

console.log(`[v0] Triggering Scidoo sync for hotel ${hotelId}...`)
console.log(`[v0] Date range: ${dateFrom} to ${dateTo}`)

try {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SCIDOO_API_TOKEN || ''}`,
    },
  })

  const data = await response.json()
  console.log('[v0] Sync response:', data)

  if (response.ok) {
    console.log('[v0] ✅ Sync triggered successfully!')
  } else {
    console.error('[v0] ❌ Sync failed:', data)
  }
} catch (error) {
  console.error('[v0] Error triggering sync:', error)
}
