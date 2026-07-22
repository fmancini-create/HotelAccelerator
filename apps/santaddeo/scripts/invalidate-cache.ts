import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca" // Villa I Barronci

async function main() {
  // Delete all known keys
  const namespaces = ["metrics", "production", "channel-production", "availability", "hotel-info"]
  const periods = ["mtd", "ytd", "last30", "last90", "last365", "custom"]
  const keysToDelete: string[] = []

  for (const ns of namespaces) {
    for (const period of periods) {
      keysToDelete.push(`santaddeo:${ns}:${hotelId}:${period}`)
    }
  }

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete)
    console.log(`Deleted ${keysToDelete.length} known keys`)
  }

  // Scan and delete remaining keys
  let cursor = 0
  let totalScanned = 0
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: `santaddeo:*:${hotelId}:*`,
      count: 100,
    })
    cursor = Number(nextCursor)
    if (keys.length > 0) {
      await redis.del(...keys)
      totalScanned += keys.length
      console.log(`Deleted ${keys.length} scanned keys:`, keys)
    }
  } while (cursor !== 0)

  console.log(`Total scanned keys deleted: ${totalScanned}`)
  console.log("Cache invalidated for Villa I Barronci!")
}

main().catch(console.error)
