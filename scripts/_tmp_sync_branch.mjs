#!/usr/bin/env node
/**
 * One-shot script: create a clean branch from `stable-gmail` HEAD and apply
 * every file that differs between `stable-gmail` and the working directory
 * via the GitHub Git Data API. Sidesteps local git auth issues and squash-merge
 * divergence.
 *
 * Strategy:
 *   1. List files changed between stable-gmail...v0/4bidsrl-8adf5f23 (source of truth for WHICH paths to touch).
 *   2. For each file: status=added|modified|renamed -> read from local fs, create blob.
 *                     status=removed             -> include `sha: null` in tree to delete.
 *   3. Create a single tree with base_tree=stable-gmail HEAD.
 *   4. Create one commit on top of stable-gmail HEAD.
 *   5. Create/force-update refs/heads/ship-crm-signature-fixes.
 */

import { execSync, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"

const OWNER = "fmancini-create"
const REPO = "HotelAccelerator"
const BASE_BRANCH = "stable-gmail"
const SOURCE_BRANCH = "v0/4bidsrl-8adf5f23"
const TARGET_BRANCH = "ship-crm-signature-fixes"
const PROJECT_ROOT = "/vercel/share/v0-project"

// Exclude clearly non-product files that would bloat the commit.
const EXCLUDE_PATTERNS = [
  /^scripts\/_tmp_/,
  /^tsconfig\.tsbuildinfo$/,
  /^\.next\//,
  /^node_modules\//,
]

// Strip any stale auth tokens; let gh use its internal keyring.
const cleanEnv = { ...process.env }
delete cleanEnv.GH_TOKEN
delete cleanEnv.GITHUB_TOKEN
delete cleanEnv.GH_ENTERPRISE_TOKEN
delete cleanEnv.GITHUB_ENTERPRISE_TOKEN

const tmpDir = mkdtempSync(path.join(tmpdir(), "ghsync-"))

function ghApi(method, endpoint, bodyObj) {
  if (!bodyObj) {
    const res = spawnSync("gh", ["api", "-X", method, `repos/${OWNER}/${REPO}/${endpoint}`], {
      encoding: "utf-8",
      maxBuffer: 100 * 1024 * 1024,
      env: cleanEnv,
    })
    if (res.status !== 0) {
      console.error(`gh api ${method} ${endpoint} -> exit ${res.status}`)
      console.error(res.stderr)
      process.exit(1)
    }
    return JSON.parse(res.stdout)
  }
  const tmpFile = path.join(tmpDir, `body_${randomUUID()}.json`)
  writeFileSync(tmpFile, JSON.stringify(bodyObj))
  try {
    const res = spawnSync(
      "gh",
      ["api", "-X", method, `repos/${OWNER}/${REPO}/${endpoint}`, "--input", tmpFile],
      { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024, env: cleanEnv },
    )
    if (res.status !== 0) {
      console.error(`gh api ${method} ${endpoint} -> exit ${res.status}`)
      console.error(res.stderr)
      process.exit(1)
    }
    return JSON.parse(res.stdout)
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {}
  }
}

const ghGet = (endpoint) => ghApi("GET", endpoint)
const ghPost = (endpoint, body) => ghApi("POST", endpoint, body)
const ghPatch = (endpoint, body) => ghApi("PATCH", endpoint, body)

console.log(`[1/6] Fetching stable-gmail HEAD...`)
const baseBranch = ghGet(`branches/${BASE_BRANCH}`)
const baseSha = baseBranch.commit.sha
console.log(`      base sha: ${baseSha.slice(0, 10)}`)

console.log(`[2/6] Listing files changed between ${BASE_BRANCH}...${SOURCE_BRANCH}...`)
// The compare API paginates file lists at 300. For safety page manually.
const files = []
let page = 1
while (true) {
  const res = ghGet(`compare/${BASE_BRANCH}...${SOURCE_BRANCH}?per_page=100&page=${page}`)
  if (!res.files || res.files.length === 0) break
  files.push(...res.files)
  if (res.files.length < 100) break
  page += 1
  if (page > 20) break
}
console.log(`      ${files.length} files changed`)

const keep = files.filter((f) => !EXCLUDE_PATTERNS.some((re) => re.test(f.filename)))
console.log(`      ${keep.length} after exclude filters`)

console.log(`[3/6] Creating blobs for added/modified files...`)
const treeItems = []
let blobCount = 0
for (const f of keep) {
  if (f.status === "removed") {
    treeItems.push({ path: f.filename, mode: "100644", type: "blob", sha: null })
    continue
  }
  const abs = path.join(PROJECT_ROOT, f.filename)
  let content
  try {
    content = readFileSync(abs, "utf-8")
  } catch (e) {
    console.error(`      cannot read ${f.filename}: ${e.message}`)
    process.exit(1)
  }
  const blob = ghPost("git/blobs", { content, encoding: "utf-8" })
  treeItems.push({ path: f.filename, mode: "100644", type: "blob", sha: blob.sha })
  blobCount += 1
  if (blobCount % 5 === 0) console.log(`      ${blobCount}/${keep.length} blobs...`)
}
console.log(`      ${blobCount} blobs created, ${treeItems.length - blobCount} deletions queued`)

console.log(`[4/6] Creating tree...`)
const tree = ghPost("git/trees", { base_tree: baseSha, tree: treeItems })
console.log(`      tree sha: ${tree.sha.slice(0, 10)}`)

console.log(`[5/6] Creating commit...`)
const commitMessage = `Ship: CRM auto-capture contatti + firma rich-text in tutti i send

Consolida su stable-gmail l'intero working set della branch ${SOURCE_BRANCH}:

CRM auto-capture
- scripts/072_crm_auto_capture.sql: tabella crm_auto_capture_settings + RLS tenant-scoped (applicata in prod)
- lib/crm/auto-capture.ts: policy layer (getSettings, isEmailAllowed, autoCaptureContact, captureOutboundRecipients, parseRecipientList)
- app/api/admin/crm/auto-capture-settings/route.ts: GET/PUT con auth + isolation per property
- app/admin/crm/settings/page.tsx: UI toggle master, toggle direzioni, blacklist domini+keyword, tag default
- lib/email/email-processor.ts: findOrCreateContact delega al policy layer
- Send endpoints (compose/reply/inbox/send-oauth): dopo send chiamano captureOutboundRecipients con TO

Firma rich-text dispatch
- lib/email/signature.ts: utility (getUserSignature, appendSignatureHtml, appendSignatureText)
- Send endpoints: appendSignatureHtml in tutti e 4 i path. send-oauth convertito da text/plain a text/html

Fix vari
- Platform chrome globale persistente
- Inbox Gmail mode: fix scroll orizzontale e espansione flex colonna main

Co-authored-by: v0[bot] <v0[bot]@users.noreply.github.com>`

const commit = ghPost("git/commits", {
  message: commitMessage,
  tree: tree.sha,
  parents: [baseSha],
})
console.log(`      commit sha: ${commit.sha.slice(0, 10)}`)

console.log(`[6/6] Creating/updating ref refs/heads/${TARGET_BRANCH}...`)
let refExists = true
try {
  ghGet(`git/ref/heads/${TARGET_BRANCH}`)
} catch {
  refExists = false
}
if (!refExists) {
  ghPost("git/refs", { ref: `refs/heads/${TARGET_BRANCH}`, sha: commit.sha })
  console.log(`      ref created`)
} else {
  ghPatch(`git/refs/heads/${TARGET_BRANCH}`, { sha: commit.sha, force: true })
  console.log(`      ref force-updated`)
}

console.log(`\nDone.`)
console.log(`Commit:  https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`)
console.log(`Branch:  https://github.com/${OWNER}/${REPO}/tree/${TARGET_BRANCH}`)
