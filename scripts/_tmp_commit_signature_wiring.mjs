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

function gh(cmd) {
  try {
    return execSync(`gh api ${cmd}`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 })
  } catch (e) {
    console.error("gh api failed:", cmd)
    console.error(e.stderr?.toString() || e.message)
    process.exit(1)
  }
}

function ghPost(endpoint, bodyJson) {
  // Use --input - to pass JSON via stdin, avoids argv-size/escaping issues.
  const cmd = `gh api -X POST repos/${OWNER}/${REPO}/${endpoint} --input -`
  try {
    return execSync(cmd, {
      input: JSON.stringify(bodyJson),
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch (e) {
    console.error("gh api POST failed:", endpoint)
    console.error(e.stderr?.toString() || e.message)
    process.exit(1)
  }
}

function ghPatch(endpoint, bodyJson) {
  const cmd = `gh api -X PATCH repos/${OWNER}/${REPO}/${endpoint} --input -`
  try {
    return execSync(cmd, {
      input: JSON.stringify(bodyJson),
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch (e) {
    console.error("gh api PATCH failed:", endpoint)
    console.error(e.stderr?.toString() || e.message)
    process.exit(1)
  }
}

const projectRoot = "/vercel/share/v0-project"

console.log("[1/4] Creating blobs...")
const tree = []
for (const relPath of FILES) {
  const abs = path.join(projectRoot, relPath)
  const content = readFileSync(abs, "utf-8")
  const res = JSON.parse(
    ghPost("git/blobs", {
      content,
      encoding: "utf-8",
    }),
  )
  console.log(`  blob ${res.sha.slice(0, 10)}  ${relPath}`)
  tree.push({
    path: relPath,
    mode: "100644",
    type: "blob",
    sha: res.sha,
  })
}

console.log("[2/4] Creating tree...")
const treeRes = JSON.parse(
  ghPost("git/trees", {
    base_tree: BASE_SHA,
    tree,
  }),
)
console.log(`  tree ${treeRes.sha.slice(0, 10)}`)

console.log("[3/4] Creating commit...")
const commitRes = JSON.parse(
  ghPost("git/commits", {
    message: COMMIT_MESSAGE,
    tree: treeRes.sha,
    parents: [BASE_SHA],
  }),
)
console.log(`  commit ${commitRes.sha.slice(0, 10)}`)

console.log("[4/4] Updating ref...")
const refRes = JSON.parse(
  ghPatch(`git/refs/heads/${BRANCH}`, {
    sha: commitRes.sha,
    force: true,
  }),
)
console.log(`  ref ${refRes.ref} -> ${refRes.object.sha.slice(0, 10)}`)

console.log("\nDone. New commit on branch:", BRANCH)
console.log("Commit SHA:", commitRes.sha)
