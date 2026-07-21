// This script reprocesses all existing raw bookings through PMSImportService
// Run by calling POST /api/superadmin/reprocess-bookings

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

async function main() {
  console.log("Starting reprocessing of all raw bookings...")
  console.log(`Calling: ${APP_URL}/api/superadmin/reprocess-bookings`)

  const response = await fetch(`${APP_URL}/api/superadmin/reprocess-bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  const data = await response.json()
  console.log("Result:", JSON.stringify(data, null, 2))
}

main().catch(console.error)
