import sharp from "sharp"
import { readFileSync } from "fs"
import { resolve } from "path"

const base_dir = resolve("/")
console.log("Base dir: " + base_dir)
console.log("Looking for: " + resolve(base_dir, "public/favicon.jpg"))
const imgBuffer = readFileSync(resolve(base_dir, "public/favicon.jpg"))

const { data, info } = await sharp(imgBuffer)
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const rgba = Buffer.alloc(width * height * 4)

for (let i = 0; i < width * height; i++) {
  const srcIdx = i * channels
  const dstIdx = i * 4
  const r = data[srcIdx]
  const g = data[srcIdx + 1]
  const b = data[srcIdx + 2]
  rgba[dstIdx] = r
  rgba[dstIdx + 1] = g
  rgba[dstIdx + 2] = b
  rgba[dstIdx + 3] = (r < 40 && g < 40 && b < 40) ? 0 : 255
}

const base = { raw: { width, height, channels: 4 } }

await sharp(rgba, base).png().toFile(resolve(base_dir, "public/favicon.png"))
await sharp(rgba, base).resize(32, 32).png().toFile(resolve(base_dir, "public/icon-32.png"))
await sharp(rgba, base).resize(180, 180).png().toFile(resolve(base_dir, "public/apple-icon.png"))

console.log("Done - transparent favicon created")
console.log("Width: " + width + " Height: " + height)
