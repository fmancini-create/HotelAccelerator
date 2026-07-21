// Trigger sync for Casanova to populate rates and pricing_grid
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://santaddeo.vercel.app"

async function triggerSync() {
  console.log("Triggering Casanova GSheets sync (rates + pricing grid)...")
  
  const res = await fetch(`${APP_URL}/api/cron/sync-and-etl`, {
    method: "GET",
    headers: {
      "x-cron-secret": process.env.CRON_SECRET || "internal"
    }
  })
  
  const text = await res.text()
  console.log("Status:", res.status)
  console.log("Response:", text.substring(0, 2000))
}

triggerSync().catch(err => console.error("Error:", err))
