// One-shot: commit the 5 signature-wiring files onto signature-send-wiring
// via the GitHub Git Data API. Atomic: blobs -> tree -> commit -> update ref.
// Uses `gh api --input <file>` so the gh CLI handles auth (no token in env needed).

import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const OWNER = "fmancini-create"
const REPO = "HotelAccelerator"
const BRANCH = "signature-send-wiring"
const BASE_SHA = "6cdfca247e8cc454c259afe6bc5adb735191572c"

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

const projectRoot = "/vercel/share/v0-project"
const tmpDir = mkdtempSync(path.join(tmpdir(), "ghapi-"))

// Strip any stale auth tokens inherited from the parent process; let gh use its internal keyring.
const cleanEnv = { ...process.env }
delete cleanEnv.GH_TOKEN
delete cleanEnv.GITHUB_TOKEN
delete cleanEnv.GH_ENTERPRISE_TOKEN
delete cleanEnv.GITHUB_ENTERPRISE_TOKEN

function ghApi(method, endpoint, jsonBodyFile) {
  const args = ["api", "-X", method, `repos/${OWNER}/${REPO}/${endpoint}`, "--input", jsonBodyFile]
  const res = spawnSync("gh", args, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, env: cleanEnv })
  if (res.status !== 0) {
    console.error(`gh api ${method} ${endpoint} failed`)
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  return JSON.parse(res.stdout)
}

function writeBody(name, obj) {
  const p = path.join(tmpDir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

console.log("[1/4] Creating blobs...")
const tree = []
let i = 0
for (const relPath of FILES) {
  const abs = path.join(projectRoot, relPath)
  const content = readFileSync(abs, "utf-8")
  const body = writeBody(`blob-${i++}.json`, { content, encoding: "utf-8" })
  const res = ghApi("POST", "git/blobs", body)
  console.log(`  blob ${res.sha.slice(0, 10)}  ${relPath}`)
  tree.push({ path: relPath, mode: "100644", type: "blob", sha: res.sha })
}

console.log("[2/4] Creating tree...")
const treeRes = ghApi("POST", "git/trees", writeBody("tree.json", { base_tree: BASE_SHA, tree }))
console.log(`  tree ${treeRes.sha.slice(0, 10)}`)

console.log("[3/4] Creating commit...")
const commitRes = ghApi(
  "POST",
  "git/commits",
  writeBody("commit.json", { message: COMMIT_MESSAGE, tree: treeRes.sha, parents: [BASE_SHA] }),
)
console.log(`  commit ${commitRes.sha.slice(0, 10)}`)

console.log("[4/4] Updating ref...")
const refRes = ghApi(
  "PATCH",
  `git/refs/heads/${BRANCH}`,
  writeBody("ref.json", { sha: commitRes.sha, force: true }),
)
console.log(`  ref ${refRes.ref} -> ${refRes.object.sha.slice(0, 10)}`)

rmSync(tmpDir, { recursive: true, force: true })

console.log("\nDone.")
console.log("Branch:", BRANCH)
console.log("Commit SHA:", commitRes.sha)
