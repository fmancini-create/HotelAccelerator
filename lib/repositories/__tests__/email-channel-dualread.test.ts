import { describe, it, expect, beforeAll, vi } from "vitest"

// server-only è un no-op fuori dal bundler Next: lo neutralizziamo nei test node.
vi.mock("server-only", () => ({}))

import { encryptSecret } from "@/lib/crypto/secrets"
import { EmailChannelRepository } from "@/lib/repositories/email-channel.repository"
import { EmailChannelRepository as PlatformEmailChannelRepository } from "@/lib/platform-repositories/email-channel.repository"

beforeAll(() => {
  // Chiave di test (32 byte base64). NON è una chiave di produzione.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
})

/**
 * Costruisce un finto SupabaseClient che ritorna `row`/`rows` per i vari
 * terminatori di query usati dai repository (single/maybeSingle/await thenable).
 */
function makeSupabaseReturning(rowOrRows: any) {
  const isArray = Array.isArray(rowOrRows)
  const builder: any = {
    from: () => builder,
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => (isArray ? Promise.resolve({ data: rowOrRows, error: null }) : builder),
    single: () => Promise.resolve({ data: rowOrRows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rowOrRows, error: null }),
  }
  return builder
}

const PLAIN_ACCESS = "ya29.plain-access-token"
const PLAIN_REFRESH = "1//plain-refresh-token"

describe("EmailChannelRepository dual-read", () => {
  it("H) legacy plain: ritorna lo stesso valore", async () => {
    const repo = new EmailChannelRepository(
      makeSupabaseReturning({ id: "1", oauth_access_token: PLAIN_ACCESS, oauth_refresh_token: PLAIN_REFRESH }),
    )
    const ch = await repo.findById("1")
    expect(ch?.oauth_access_token).toBe(PLAIN_ACCESS)
    expect(ch?.oauth_refresh_token).toBe(PLAIN_REFRESH)
  })

  it("I) encrypted enc:v1: ritorna valore decifrato", async () => {
    const encAccess = encryptSecret(PLAIN_ACCESS)!
    const encRefresh = encryptSecret(PLAIN_REFRESH)!
    expect(encAccess.startsWith("enc:v1:")).toBe(true)
    const repo = new EmailChannelRepository(
      makeSupabaseReturning({ id: "1", oauth_access_token: encAccess, oauth_refresh_token: encRefresh }),
    )
    const ch = await repo.findById("1")
    expect(ch?.oauth_access_token).toBe(PLAIN_ACCESS)
    expect(ch?.oauth_refresh_token).toBe(PLAIN_REFRESH)
  })

  it("J) null resta null", async () => {
    const repo = new EmailChannelRepository(
      makeSupabaseReturning({ id: "1", oauth_access_token: null, oauth_refresh_token: null }),
    )
    const ch = await repo.findById("1")
    expect(ch?.oauth_access_token).toBeNull()
    expect(ch?.oauth_refresh_token).toBeNull()
  })

  it("K) lista mixed: legacy + cifrato + null letti correttamente", async () => {
    const encAccess = encryptSecret(PLAIN_ACCESS)!
    const repo = new EmailChannelRepository(
      makeSupabaseReturning([
        { id: "a", oauth_access_token: PLAIN_ACCESS, oauth_refresh_token: null },
        { id: "b", oauth_access_token: encAccess, oauth_refresh_token: null },
        { id: "c", oauth_access_token: null, oauth_refresh_token: null },
      ]),
    )
    const list = await repo.listByProperty("p1")
    expect(list[0].oauth_access_token).toBe(PLAIN_ACCESS)
    expect(list[1].oauth_access_token).toBe(PLAIN_ACCESS)
    expect(list[2].oauth_access_token).toBeNull()
  })

  it("preserva i campi non sensibili", async () => {
    const repo = new EmailChannelRepository(
      makeSupabaseReturning({ id: "1", name: "Reception", provider: "gmail", oauth_access_token: PLAIN_ACCESS }),
    )
    const ch = await repo.findById("1")
    expect(ch?.name).toBe("Reception")
    expect(ch?.provider).toBe("gmail")
  })

  it("platform repository: decifra enc:v1 e tollera legacy", async () => {
    const encAccess = encryptSecret(PLAIN_ACCESS)!
    const repo = new PlatformEmailChannelRepository(
      makeSupabaseReturning({ id: "1", oauth_access_token: encAccess, oauth_refresh_token: PLAIN_REFRESH }),
    )
    const ch = await repo.findByEmail("x@y.z")
    expect(ch?.oauth_access_token).toBe(PLAIN_ACCESS)
    expect(ch?.oauth_refresh_token).toBe(PLAIN_REFRESH)
  })
})
