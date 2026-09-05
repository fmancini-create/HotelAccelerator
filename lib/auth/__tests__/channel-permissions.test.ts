import { describe, expect, it } from "vitest"
import { hasChannelCapability, resolveEffectiveChannelGrants } from "@/lib/auth/channel-permissions"

const CLIENTI = "11111111-1111-4111-8111-111111111111"
const PERSONALE = "22222222-2222-4222-8222-222222222222"
const TECNICA = "33333333-3333-4333-8333-333333333333"
const FOREIGN = "99999999-9999-4999-8999-999999999999"

const tenantChannels = [
  { channel_type: "email", channel_id: CLIENTI },
  { channel_type: "email", channel_id: PERSONALE },
  { channel_type: "email", channel_id: TECNICA },
]

describe("resolveEffectiveChannelGrants", () => {
  it("grants Commerciale clienti@ only, never the Direzione personal mailbox", () => {
    const grants = resolveEffectiveChannelGrants({
      tenantChannels,
      groupPermissions: [
        {
          channel_type: "email",
          channel_id: CLIENTI,
          can_read: true,
          can_write: true,
          can_manage: false,
        },
      ],
    })

    expect(hasChannelCapability(grants, "email", CLIENTI, "read")).toBe(true)
    expect(hasChannelCapability(grants, "email", CLIENTI, "write")).toBe(true)
    expect(hasChannelCapability(grants, "email", CLIENTI, "manage")).toBe(false)
    expect(hasChannelCapability(grants, "email", PERSONALE, "read")).toBe(false)
  })

  it("makes write/manage imply read and combines multiple group grants additively", () => {
    const grants = resolveEffectiveChannelGrants({
      tenantChannels,
      groupPermissions: [
        { channel_type: "email", channel_id: CLIENTI, can_write: true },
        { channel_type: "email", channel_id: CLIENTI, can_manage: true },
      ],
    })

    expect(hasChannelCapability(grants, "email", CLIENTI, "read")).toBe(true)
    expect(hasChannelCapability(grants, "email", CLIENTI, "write")).toBe(true)
    expect(hasChannelCapability(grants, "email", CLIENTI, "manage")).toBe(true)
  })

  it("keeps legacy type wildcards inside the current tenant only", () => {
    const grants = resolveEffectiveChannelGrants({
      tenantChannels,
      groupPermissions: [{ channel_type: "email", channel_id: null, can_read: true }],
    })

    expect(grants.map((g) => g.channel_id).sort()).toEqual([CLIENTI, PERSONALE, TECNICA].sort())
    expect(hasChannelCapability(grants, "email", FOREIGN, "read")).toBe(false)
  })

  it("ignores direct assignments that reference a channel outside the tenant", () => {
    const grants = resolveEffectiveChannelGrants({
      tenantChannels,
      directAssignments: [
        { channel_type: "email", channel_id: CLIENTI, can_receive: true, can_send: false },
        { channel_type: "email", channel_id: FOREIGN, can_receive: true, can_send: true },
      ],
    })

    expect(hasChannelCapability(grants, "email", CLIENTI, "read")).toBe(true)
    expect(hasChannelCapability(grants, "email", CLIENTI, "write")).toBe(false)
    expect(hasChannelCapability(grants, "email", CLIENTI, "manage")).toBe(true)
    expect(hasChannelCapability(grants, "email", FOREIGN, "read")).toBe(false)
  })
})
