import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"

async function main() {
  let cursor = 0
  let totalDeleted = 0
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: `santaddeo:*${hotelId}*`,
      count: 100,
    })
    cursor = Number(nextCursor)
    if (keys.length > 0) {
      await redis.del(...keys)
      totalDeleted += keys.length
      console.log("Deleted keys:", keys)
    }
  } while (cursor !== 0)

  console.log("Total keys deleted:", totalDeleted)
  console.log("Cache invalidated for Villa I Barronci!")
}

main().catch(console.error)
