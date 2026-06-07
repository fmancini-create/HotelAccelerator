const sharp = require("/tmp/imgtool/node_modules/sharp")

const SIZE = 1024
const MARGIN = 96 // white padding around the logo
const SRC = process.argv[2]
const OUT = process.argv[3]

// Meta app icon requirements: square, non-transparent background, 512–1024px.
// The real Hotel Accelerator logo is wider than tall, so we fit it (contain)
// onto a white square canvas with some breathing room.
const inner = SIZE - MARGIN * 2

sharp(SRC)
  .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: MARGIN,
    bottom: MARGIN,
    left: MARGIN,
    right: MARGIN,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .png()
  .toFile(OUT)
  .then((info) => {
    console.log("[v0] logo written:", OUT, info.width + "x" + info.height, Math.round(info.size / 1024) + "KB")
  })
  .catch((err) => {
    console.error("[v0] error:", err)
    process.exit(1)
  })
