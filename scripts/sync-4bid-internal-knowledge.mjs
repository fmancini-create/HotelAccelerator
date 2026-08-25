#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const MANIFEST_PATH = "docs/knowledge/4bid/manifest.json"
const MAX_SOURCE_CHARS = 500_000
const PRODUCT_LABELS = {
  "hotel-accelerator": "Hotel Accelerator",
  "santaddeo-rms": "Santaddeo RMS",
  "hotel-profit-ai": "Hotel Profit AI",
  manubot: "ManuBot",
}
const PRODUCT_KEYS = new Set(Object.keys(PRODUCT_LABELS))
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const REVISION = /^[A-Fa-f0-9]{7,64}$/
const REPO_PATH = /^(?![./\\])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ -]+\.md$/

const dryRun = process.argv.includes("--dry-run")

function fail(message) {
  throw new Error(`[4bid-knowledge-sync] ${message}`)
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

function signature(rawBody, timestamp, secret) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`
}

function cleanRepository(value) {
  const repository = String(value ?? "").trim()
  if (!REPOSITORY.test(repository)) fail("GITHUB_REPOSITORY non valido")
  return repository
}

function cleanRevision(value) {
  const revision = String(value ?? "").trim()
  if (!REVISION.test(revision)) fail("GITHUB_SHA non valido")
  return revision
}

async function readSource(path) {
  if (typeof path !== "string" || !REPO_PATH.test(path)) fail(`Percorso non consentito: ${String(path)}`)
  const absolute = resolve(ROOT, path)
  const rel = relative(ROOT, absolute)
  if (!rel || rel.startsWith(`..${sep}`) || rel === "..") fail(`Percorso fuori repository: ${path}`)
  try {
    return (await readFile(absolute, "utf8")).trim()
  } catch (error) {
    fail(`Impossibile leggere ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function readManifest() {
  try {
    return await readFile(resolve(ROOT, MANIFEST_PATH), "utf8")
  } catch (error) {
    fail(`Impossibile leggere il manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function buildPayloads() {
  const manifestRaw = await readManifest()
  let manifest
  try {
    manifest = JSON.parse(manifestRaw)
  } catch {
    fail("Manifest JSON non valido")
  }
  if (manifest?.version !== 1 || !Array.isArray(manifest.products) || manifest.products.length < 1) {
    fail("Manifest senza prodotti validi")
  }

  const repository = cleanRepository(process.env.GITHUB_REPOSITORY)
  const revision = cleanRevision(process.env.GITHUB_SHA)
  const productKeys = new Set()
  const payloads = []

  for (const product of manifest.products) {
    const productKey = product?.product_key
    if (!PRODUCT_KEYS.has(productKey) || productKeys.has(productKey)) fail("Prodotto duplicato o non valido nel manifest")
    if (!Array.isArray(product.source_paths) || product.source_paths.length < 1 || product.source_paths.length > 40) {
      fail(`Elenco dei file non valido per ${productKey}`)
    }
    productKeys.add(productKey)

    const sourcePaths = [...new Set(product.source_paths)]
    if (sourcePaths.length !== product.source_paths.length) fail(`File duplicato per ${productKey}`)
    const documents = await Promise.all(sourcePaths.map(readSource))
    if (documents.some((document) => document.length === 0)) fail(`Un file della fonte ${productKey} e' vuoto`)

    const content = [
      `# Documentazione interna 4BID — ${PRODUCT_LABELS[productKey]}`,
      "",
      "Questa e' una fonte interna sincronizzata dal repository. Rispondi solo con informazioni fondate nel contenuto.",
      ...documents.flatMap((document, index) => ["", "---", "", `## Documento interno ${index + 1}`, "", document]),
      "",
    ].join("\n")
    if (content.length > MAX_SOURCE_CHARS) fail(`Fonte ${productKey} oltre il limite di ${MAX_SOURCE_CHARS} caratteri`)

    payloads.push({
      product_key: productKey,
      repository,
      revision,
      source_paths: sourcePaths,
      content_sha256: sha256(content),
      content,
    })
  }
  return payloads
}

async function sync(payload) {
  const endpoint = String(process.env.INTERNAL_KNOWLEDGE_SYNC_URL ?? "").trim()
  const secret = String(process.env.INTERNAL_KNOWLEDGE_SYNC_SECRET ?? "")
  if (!endpoint.startsWith("https://")) fail("INTERNAL_KNOWLEDGE_SYNC_URL deve usare https")
  if (secret.length < 32) fail("INTERNAL_KNOWLEDGE_SYNC_SECRET mancante o troppo corto")

  const rawBody = JSON.stringify(payload)
  const timestamp = String(Date.now())
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-knowledge-timestamp": timestamp,
      "x-internal-knowledge-signature": signature(rawBody, timestamp, secret),
    },
    body: rawBody,
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) fail(`Sync ${payload.product_key} rifiutato (${response.status}): ${json?.error ?? "errore sconosciuto"}`)
  console.log(`[4bid-knowledge-sync] ${payload.product_key}: ${json?.indexing ?? "accepted"}`)
}

const payloads = await buildPayloads()
if (dryRun) {
  for (const payload of payloads) {
    console.log(`[4bid-knowledge-sync] ${payload.product_key}: ${payload.source_paths.length} file, ${payload.content.length} caratteri`)
  }
} else {
  for (const payload of payloads) await sync(payload)
}
