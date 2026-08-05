import "server-only"

export type Verification = { type: string; domain: string; value: string; reason?: string }
export type ProjectDomain = {
  name: string
  apexName?: string
  projectId?: string
  verified: boolean
  verification?: Verification[]
}

type RankedCname = { rank: number; value: string }
type RankedIpv4 = { rank: number; value: string[] }

export type DomainConfiguration = {
  acceptedChallenges?: string[]
  configuredBy?: string | null
  misconfigured: boolean
  recommendedCNAME?: RankedCname[]
  recommendedIPv4?: RankedIpv4[]
}

export type DnsInstruction = {
  type: "A" | "CNAME" | "TXT"
  name: string
  value: string
  purpose: "ownership" | "routing"
}

export type DomainReadinessStatus =
  | "not_configured"
  | "automation_unavailable"
  | "not_registered"
  | "verification_required"
  | "dns_pending"
  | "ready"
  | "error"

export type DomainReadiness = {
  name: string | null
  status: DomainReadinessStatus
  ready: boolean
  verified: boolean
  misconfigured: boolean | null
  configuredBy: string | null
  dns: DnsInstruction[]
  checkedAt: string
  message: string
}

export class VercelApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = "VercelApiError"
  }
}

function configuration() {
  const token = process.env.VERCEL_API_TOKEN
  const project = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !project) throw new VercelApiError("Configurazione Vercel domini incompleta", 503, "configuration_missing")
  return { token, project, teamId }
}

export function isProjectDomainAutomationConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN && (process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME))
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token, teamId } = configuration()
  const query = teamId ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : ""
  const response = await fetch(`https://api.vercel.com${path}${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Vercel API ${response.status}`
    const code = data?.error?.code || data?.code
    throw new VercelApiError(message, response.status, code)
  }
  return data as T
}

export async function getProjectDomain(name: string): Promise<ProjectDomain | null> {
  const { project } = configuration()
  try {
    return await request<ProjectDomain>(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}`)
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 404) return null
    throw error
  }
}

export async function getDomainConfiguration(name: string): Promise<DomainConfiguration> {
  const { project } = configuration()
  return request<DomainConfiguration>(
    `/v6/domains/${encodeURIComponent(name)}/config?projectIdOrName=${encodeURIComponent(project)}&strict=true`,
  )
}

export async function addProjectDomain(name: string): Promise<ProjectDomain> {
  const { project } = configuration()
  try {
    return await request<ProjectDomain>(`/v10/projects/${encodeURIComponent(project)}/domains`, {
      method: "POST",
      body: JSON.stringify({ name }),
    })
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 409) {
      const existing = await getProjectDomain(name)
      if (existing) return existing
    }
    throw error
  }
}

export async function verifyProjectDomain(name: string): Promise<ProjectDomain> {
  const { project } = configuration()
  return request<ProjectDomain>(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}/verify`, {
    method: "POST",
  })
}

export async function removeProjectDomain(name: string): Promise<void> {
  const { project } = configuration()
  await request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}`, { method: "DELETE" })
}

function preferred<T extends { rank: number }>(items: T[] | undefined): T | undefined {
  return items?.slice().sort((a, b) => a.rank - b.rank)[0]
}

function dnsInstructions(domain: ProjectDomain, config: DomainConfiguration): DnsInstruction[] {
  const ownership = (domain.verification ?? []).map((item): DnsInstruction => ({
    type: item.type.toUpperCase() === "TXT" ? "TXT" : "TXT",
    name: item.domain,
    value: item.value,
    purpose: "ownership",
  }))
  const isApex = domain.apexName ? domain.name === domain.apexName : domain.name.split(".").length === 2
  const cname = preferred(config.recommendedCNAME)
  const ipv4 = preferred(config.recommendedIPv4)
  const routing: DnsInstruction[] = []
  if (isApex && ipv4?.value?.[0]) {
    routing.push({ type: "A", name: "@", value: ipv4.value[0], purpose: "routing" })
  } else if (cname?.value) {
    routing.push({ type: "CNAME", name: domain.name, value: cname.value, purpose: "routing" })
  } else if (ipv4?.value?.[0]) {
    routing.push({ type: "A", name: domain.name, value: ipv4.value[0], purpose: "routing" })
  }
  return [...ownership, ...routing]
}

export async function inspectProjectDomain(name: string | null | undefined): Promise<DomainReadiness> {
  const checkedAt = new Date().toISOString()
  if (!name) {
    return {
      name: null,
      status: "not_configured",
      ready: false,
      verified: false,
      misconfigured: null,
      configuredBy: null,
      dns: [],
      checkedAt,
      message: "Indirizzo non configurato",
    }
  }
  if (!isProjectDomainAutomationConfigured()) {
    return {
      name,
      status: "automation_unavailable",
      ready: false,
      verified: false,
      misconfigured: null,
      configuredBy: null,
      dns: [],
      checkedAt,
      message: "Automazione domini Vercel non configurata",
    }
  }
  try {
    const domain = await getProjectDomain(name)
    if (!domain) {
      return {
        name,
        status: "not_registered",
        ready: false,
        verified: false,
        misconfigured: null,
        configuredBy: null,
        dns: [],
        checkedAt,
        message: "Indirizzo non ancora registrato sul progetto Vercel",
      }
    }
    const config = await getDomainConfiguration(name)
    const dns = dnsInstructions(domain, config)
    if (!domain.verified) {
      return {
        name,
        status: "verification_required",
        ready: false,
        verified: false,
        misconfigured: config.misconfigured,
        configuredBy: config.configuredBy ?? null,
        dns,
        checkedAt,
        message: "Verifica della proprietà del dominio richiesta",
      }
    }
    if (config.misconfigured) {
      return {
        name,
        status: "dns_pending",
        ready: false,
        verified: true,
        misconfigured: true,
        configuredBy: config.configuredBy ?? null,
        dns,
        checkedAt,
        message: "DNS non ancora valido; SSL non può essere emesso",
      }
    }
    return {
      name,
      status: "ready",
      ready: true,
      verified: true,
      misconfigured: false,
      configuredBy: config.configuredBy ?? null,
      dns,
      checkedAt,
      message: "DNS valido e dominio pronto su Vercel",
    }
  } catch (error) {
    return {
      name,
      status: error instanceof VercelApiError && error.code === "configuration_missing" ? "automation_unavailable" : "error",
      ready: false,
      verified: false,
      misconfigured: null,
      configuredBy: null,
      dns: [],
      checkedAt,
      message: error instanceof VercelApiError && error.status === 403
        ? "Il token Vercel non dispone dei permessi necessari"
        : "Verifica Vercel temporaneamente non disponibile",
    }
  }
}
