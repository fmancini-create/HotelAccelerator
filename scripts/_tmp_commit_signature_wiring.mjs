// One-shot script: commit the 5 signature-wiring files onto the
// `signature-send-wiring` branch via the GitHub Git Data API.
// Atomic: blobs -> tree -> commit -> update ref.

import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const OWNER = "fmancini-create"
const REPO = "HotelAccelerator"
const BRANCH = "signature-send-wiring"
const BASE_SHA = "6cdfca247e8cc454c259afe6bc5adb735191572c" // stable-gmail HEAD at time of branch

const FILES = [
  "lib/email/signature.ts",
  "app/api/gmail/threads/[threadId]/reply/route.ts",
  "app/api/gmail/compose/route.ts",
  "app/api/inbox/email/send/route.ts",
  "app/api/channels/email/send-oauth/route.ts",
]

const COMMIT_MESSAGE = `Signature: iniezione firma rich-text in tutti gli endpoint di invio

- lib/email/signature.ts: utility centrale (getUserSignature, appendSignatureHtml, appendSignatureText)
- app/api/gmail/threads/[threadId]/reply: append firma su reply Gmail via OAuth
- app/api/gmail/compose: append firma su nuovi thread Gmail via OAuth
- app/api/inbox/email/send: append firma su SMTP send (nodemailer, HTML + text/plain fallback)
- app/api/channels/email/send-oauth: convertito da text/plain a text/html per Gmail+Outlook, firma appesa

Co-authored-by: v0[bot] <v0[bot]@users.noreply.github.com>`

// Pull a fresh token at script start; gh handles expiry/refresh.
const TOKEN = execSync("gh auth token", { encoding: "utf-8" }).trim()
if (!TOKEN) {
  console.error("No gh auth token available")
  process.exit(1)
}

async function ghFetch(method, endpoint, body) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/${endpoint}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${method} ${endpoint} -> ${res.status}`)
    console.error(text.slice(0, 500))
    process.exit(1)
  }
  return JSON.parse(text)
}

const ghPost = (endpoint, body) => ghFetch("POST", endpoint, body)
const ghPatch = (endpoint, body) => ghFetch("PATCH", endpoint, body)

const projectRoot = "/vercel/share/v0-project"

console.log("[1/4] Creating blobs...")
const tree = []
for (const relPath of FILES) {
  const abs = path.join(projectRoot, relPath)
  const content = readFileSync(abs, "utf-8")
  const res = await ghPost("git/blobs", { content, encoding: "utf-8" })
  console.log(`  blob ${res.sha.slice(0, 10)}  ${relPath}`)
  tree.push({
    path: relPath,
    mode: "100644",
    type: "blob",
    sha: res.sha,
  })
}

console.log("[2/4] Creating tree...")
const treeRes = await ghPost("git/trees", { base_tree: BASE_SHA, tree })
console.log(`  tree ${treeRes.sha.slice(0, 10)}`)

console.log("[3/4] Creating commit...")
const commitRes = await ghPost("git/commits", {
  message: COMMIT_MESSAGE,
  tree: treeRes.sha,
  parents: [BASE_SHA],
})
console.log(`  commit ${commitRes.sha.slice(0, 10)}`)

console.log("[4/4] Updating ref...")
const refRes = await ghPatch(`git/refs/heads/${BRANCH}`, {
  sha: commitRes.sha,
  force: true,
})
console.log(`  ref ${refRes.ref} -> ${refRes.object.sha.slice(0, 10)}`)

console.log("\nDone. New commit on branch:", BRANCH)
console.log("Commit SHA:", commitRes.sha)
