import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let getWhatsAppChannelByPhoneNumberId: typeof import("../channels").getWhatsAppChannelByPhoneNumberId
let getWhatsAppChannelById: typeof import("../channels").getWhatsAppChannelById
let listWhatsAppChannelsForProperty: typeof import("../channels").listWhatsAppChannelsForProperty
let encryptSecret: typeof import("@/lib/crypto/secrets").encryptSecret

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64")
  const mod = await import("../channels")
  getWhatsAppChannelByPhoneNumberId = mod.getWhatsAppChannelByPhoneNumberId
  getWhatsAppChannelById = mod.getWhatsAppChannelById
  listWhatsAppChannelsForProperty = mod.listWhatsAppChannelsForProperty
  const crypto = await import("@/lib/crypto/secrets")
  encryptSecret = crypto.encryptSecret
})

/**
 * Costruisce un finto SupabaseClient il cui builder di query è "thenable":
 * ogni metodo (.from/.select/.eq/.order/.limit) ritorna `this`, e l'oggetto
 * risolve a `{ data }` sia con `.maybeSingle()` sia con `await` diretto (lista).
 */
function fakeSupabase(data: unknown) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ["from", "select", "eq", "order", "limit"]) {
    builder[m] = vi.fn(chain)
  }
  builder.maybeSingle = vi.fn(async () => ({ data: Array.isArray(data) ? data[0] ?? null : data }))
  builder.then = (resolve: (v: { data: unknown }) => unknown) => resolve({ data })
  return { from: () => builder } as never
}

const baseRow = (credentials: unknown) => ({
  id: "ch1",
  property_id: "prop1",
  channel_type: "whatsapp",
  config: { phone_number_id: "123456", waba_id: "waba1" },
  credentials,
  is_active: true,
  is_default: true,
})

describe("channels.ts dual-read", () => {
  it("J) legacy plain: ritorna le credenziali invariate lato server", async () => {
    const supabase = fakeSupabase(
      baseRow({ access_token: "plain-acc", app_secret: "plain-sec", verify_token: "plain-ver" }),
    )
    const ch = await getWhatsAppChannelById(supabase, "prop1", "ch1")
    expect(ch?.credentials.access_token).toBe("plain-acc")
    expect(ch?.credentials.app_secret).toBe("plain-sec")
    expect(ch?.credentials.verify_token).toBe("plain-ver")
    // config intatto
    expect(ch?.config.phone_number_id).toBe("123456")
  })

  it("K) encrypted enc:v1: viene decifrato lato server", async () => {
    const row = baseRow({
      access_token: encryptSecret("acc-real")!,
      app_secret: encryptSecret("sec-real")!,
      verify_token: encryptSecret("ver-real")!,
    })
    const supabase = fakeSupabase(row)
    const ch = await getWhatsAppChannelByPhoneNumberId(supabase, "123456")
    expect(ch?.credentials.access_token).toBe("acc-real")
    expect(ch?.credentials.app_secret).toBe("sec-real")
    expect(ch?.credentials.verify_token).toBe("ver-real")
    expect(ch?.config.phone_number_id).toBe("123456")
  })

  it("L1) credentials null non rompe", async () => {
    const supabase = fakeSupabase(baseRow(null))
    const ch = await getWhatsAppChannelById(supabase, "prop1", "ch1")
    expect(ch?.credentials).toBeNull()
  })

  it("L2) lista mixed legacy/cifrato/null", async () => {
    const rows = [
      baseRow({ access_token: "plain-acc" }),
      baseRow({ access_token: encryptSecret("enc-acc")! }),
      baseRow(null),
    ]
    const supabase = fakeSupabase(rows)
    const list = await listWhatsAppChannelsForProperty(supabase, "prop1")
    expect(list).toHaveLength(3)
    expect(list[0].credentials.access_token).toBe("plain-acc")
    expect(list[1].credentials.access_token).toBe("enc-acc")
    expect(list[2].credentials).toBeNull()
  })
})
