const sharp = require("/tmp/imgtool/node_modules/sharp")

const SIZE = 1024
const BRAND = "#0b57d0"

// HotelAccelerator brand mark: rounded blue square with white "HA".
// White background (non-transparent) as required for Meta app icons.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
  <rect x="192" y="192" width="640" height="640" rx="140" ry="140" fill="${BRAND}"/>
  <text x="512" y="512" font-family="Arial, Helvetica, sans-serif" font-size="300" font-weight="700"
        fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="-6">HA</text>
</svg>`

sharp(Buffer.from(svg))
  .png()
  .toFile(process.argv[2])
  .then((info) => {
    console.log("[v0] logo written:", process.argv[2], info.width + "x" + info.height, Math.round(info.size / 1024) + "KB")
  })
  .catch((err) => {
    console.error("[v0] error:", err)
    process.exit(1)
  })
