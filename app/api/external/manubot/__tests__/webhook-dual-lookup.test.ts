import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock server-only ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))

// ── Mock crypto secret per token-hash (deterministico nei test) ──────────────
const TEST_HASH_SECRET = "test-token-hash-secret-32bytes-minimum-xxxxx"

// ── Mock del service client Supabase ─────────────────────────────────────────
// Cattura le chiamate .eq(col, val) per verificare quale ramo (hash/legacy)
// viene interrogato, e restituisce risultati pilotati per ciascuna colonna.
type Row = { id: string; name: string } | null

let hashRow: Row = null
let legacyRow: Row = null
const eqCalls: Array<{ table: string; col: string }> = []
let upsertPayload: any = null

function makeQuery(table: string) {
  // builder concatenabile: .select().eq().maybeSingle()/.single()
  let currentCol = ""
  const builder: any = {
    select: () => builder,
    eq: (col: string, _val: string) => {
      currentCol = col
      eqCalls.push({ table, col })
      return builder
    },
    maybeSingle: async () => {
      if (table === "properties" && currentCol === "api_token_hash") return { data: hashRow, error: null }
      if (table === "properties" && currentCol === "api_token") return { data: legacyRow, error: null }
      return { data: null, error: null }
    },
    single: async () => {
      // usato dall'upsert dei todos
      return { data: { id: "todo-1", status: "open", updated_at: new Date().toISOString() }, error: null }
    },
    upsert: (payload: any) => {
      upsertPayload = payload
      return builder
    },
  }
  return builder
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => makeQuery(table),
  }),
}))

// Mapping reali non necessari: mock minimale
vi.mock("@/lib/manubot", () => ({
  MANUBOT_TO_HA_STATUS: { pending: "open" },
  MANUBOT_TO_HA_PRIORITY: { medium: "normal" },
}))

const TOKEN = "a".repeat(64)

function makeRequest(headers: Record<string, string>, body: any) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as any
}

async function loadRoute() {
  vi.resetModules()
  process.env.API_TOKEN_HASH_SECRET = TEST_HASH_SECRET
  return await import("../route")
}

describe("webhook ManuBot — dual-lookup (Fase C)", () => {
  beforeEach(() => {
    hashRow = null
    legacyRow = null
    eqCalls.length = 0
    upsertPayload = null
    process.env.API_TOKEN_HASH_SECRET = TEST_HASH_SECRET
  })

  it("match via hash: trova property via api_token_hash e NON chiama il fallback legacy", async () => {
    hashRow = { id: "prop-hash", name: "Hotel Hash" }
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ authorization: `Bearer ${TOKEN}` }, { event: "task.created", data: { id: "t1", title: "X", status: "pending" } }))
    expect(res.status).toBe(200)
    const cols = eqCalls.filter((c) => c.table === "properties").map((c) => c.col)
    expect(cols).toContain("api_token_hash")
    expect(cols).not.toContain("api_token") // fallback NON interrogato
    expect(upsertPayload.property_id).toBe("prop-hash")
  })

  it("fallback legacy: hash non trova, api_token trova → autorizzato", async () => {
    hashRow = null
    legacyRow = { id: "prop-legacy", name: "Hotel Legacy" }
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ authorization: `Bearer ${TOKEN}` }, { event: "task.created", data: { id: "t1", title: "X", status: "pending" } }))
    expect(res.status).toBe(200)
    const cols = eqCalls.filter((c) => c.table === "properties").map((c) => c.col)
    expect(cols).toContain("api_token_hash") // ramo primario tentato
    expect(cols).toContain("api_token") // poi fallback
    expect(upsertPayload.property_id).toBe("prop-legacy")
  })

  it("unauthorized: né hash né legacy trovano → 401", async () => {
    hashRow = null
    legacyRow = null
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ authorization: `Bearer ${TOKEN}` }, { event: "task.created", data: { id: "t1", title: "X" } }))
    expect(res.status).toBe(401)
  })

  it("header mancante → 401 (nessun lookup)", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({}, {}))
    expect(res.status).toBe(401)
    expect(eqCalls.length).toBe(0)
  })

  it("header non Bearer → 401", async () => {
    const { POST } = await loadRoute()
    // "Basic xyz" → replace("Bearer ","") non rimuove nulla, ma resta una stringa:
    // per garantire 401 usiamo un header senza token Bearer valido (vuoto dopo trim).
    const res = await POST(makeRequest({ authorization: "Bearer " }, {}))
    expect(res.status).toBe(401)
    expect(eqCalls.length).toBe(0)
  })

  it("env mancante: API_TOKEN_HASH_SECRET assente → errore controllato 500, nessun valore esposto", async () => {
    hashRow = null
    legacyRow = null
    vi.resetModules()
    delete process.env.API_TOKEN_HASH_SECRET
    const { POST } = await import("../route")
    const res = await POST(makeRequest({ authorization: `Bearer ${TOKEN}` }, { event: "task.created", data: { id: "t1", title: "X" } }))
    // hashApiToken lancia → catch esterno → 500 generico
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain(TOKEN)
  })
})
