import fs from 'fs'

// The project files are mounted at /vercel/share/v0-project
const filePath = '/vercel/share/v0-project/app/accelerator/pricing/page.tsx'
let content
try {
  content = fs.readFileSync(filePath, 'utf8')
  console.log("Read OK from:", filePath)
} catch (e) {
  console.log("Cannot read:", filePath, e.message)
  // Try symlink
  try {
    const ls = fs.readdirSync('/vercel/share/v0-project/app/accelerator/pricing/')
    console.log("Dir contents:", ls)
  } catch (e2) {
    console.log("Cannot list dir:", e2.message)
    try {
      const ls2 = fs.readdirSync('/vercel/share/')
      console.log("/vercel/share contents:", ls2)
    } catch (e3) {
      console.log("Cannot list /vercel/share:", e3.message)
      try {
        const ls3 = fs.readdirSync('/vercel/')
        console.log("/vercel contents:", ls3)
      } catch (e4) {
        console.log("Cannot list /vercel:", e4.message)
      }
    }
  }
  process.exit(1)
}

const lines = content.split('\n')
console.log("Total lines:", lines.length)

let depth = 0
const componentStart = 157
for (let i = componentStart; i < lines.length; i++) {
  const line = lines[i]
  const stripped = line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

  for (const ch of stripped) {
    if (ch === '{') depth++
    if (ch === '}') depth--
  }

  if (depth === 0 && i < lines.length - 5) {
    console.log(`PREMATURE_CLOSE line ${i + 1}: depth=0`)
  }
  if (depth < 0) {
    console.log(`NEGATIVE line ${i + 1}: depth=${depth}`)
    break
  }
}
console.log(`Final depth: ${depth}`)
