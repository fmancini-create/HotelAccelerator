const sharp = require("/tmp/imgtool/node_modules/sharp")

const SIZE = 1024
const SRC = process.argv[2]
const OUT = process.argv[3]

// Meta app icon: square PNG 512–1024px with a TRANSPARENT background.
// The source is a JPG with a white background, so we key out the white
// (white -> transparent) with a soft edge, trim, then center on a
// transparent square canvas with padding.
async function run() {
  // Trim the white border first to know the true logo bounds.
  const trimmed = await sharp(SRC).trim({ threshold: 12 }).toBuffer()

  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info

  // White / near-white -> transparent, with a feathered ramp on the edges.
  for (let i = 0; i < data.length; i += channels) {
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    if (min >= 250) {
      data[i + 3] = 0
    } else if (min >= 228) {
      data[i + 3] = Math.round(((min < 250 ? 250 - min : 0) / 22) * 255)
    }
  }

  const keyed = await sharp(data, { raw: { width, height, channels } }).png().toBuffer()

  // Center the keyed logo on a transparent square canvas with ~8% padding.
  const side = Math.max(width, height)
  const canvas = Math.round(side * 1.16)

  await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: keyed, gravity: "center" }])
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(OUT)

  const o = await sharp(OUT).metadata()
  console.log("[v0] logo written:", OUT, o.width + "x" + o.height, "alpha:", o.hasAlpha)
}

run().catch((err) => {
  console.error("[v0] error:", err)
  process.exit(1)
})
