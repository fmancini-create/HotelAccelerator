import "server-only"

type Verification = { type: string; domain: string; value: string; reason?: string }
export type ProjectDomain = { name: string; verified: boolean; verification?: Verification[] }

class VercelApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function configuration() {
  const token = process.env.VERCEL_API_TOKEN
  const project = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !project) throw new Error("Configurazione Vercel domini incompleta")
  return { token, project, teamId }
}

async function request(path: string, init: RequestInit = {}) {
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
    throw new VercelApiError(message, response.status)
  }
  return data
}

export async function addProjectDomain(name: string): Promise<ProjectDomain> {
  const { project } = configuration()
  try {
    return await request(`/v10/projects/${encodeURIComponent(project)}/domains`, {
      method: "POST", body: JSON.stringify({ name }),
    })
  } catch (error) {
    // Idempotency: a retry may find the domain already attached to this project.
    if (error instanceof VercelApiError && error.status === 409) {
      return request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}`)
    }
    throw error
  }
}

export async function verifyProjectDomain(name: string): Promise<ProjectDomain> {
  const { project } = configuration()
  return request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}/verify`, { method: "POST" })
}

export async function removeProjectDomain(name: string): Promise<void> {
  const { project } = configuration()
  await request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}`, { method: "DELETE" })
}
