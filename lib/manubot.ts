/**
 * Manubot API Client
 * Base URL: https://manubot.it/api
 * Auth: Supabase JWT (login con email/password della company)
 *
 * Ogni property in HotelAccelerator ha:
 *   - manubot_email: email account Manubot della struttura
 *   - manubot_password: password account Manubot
 *   - manubot_supabase_url: URL Supabase di Manubot (per il login JWT)
 *   - manubot_company_id: UUID company su Manubot
 */

/**
 * Legge una variabile ambiente obbligatoria.
 * Lancia un errore controllato (senza mai esporre il valore) se mancante.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Configurazione Manubot mancante: variabile ambiente ${name} non impostata`)
  }
  return value
}

export interface ManubotTask {
  id: string
  company_id: string
  title: string
  description: string | null
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "low" | "medium" | "high" | "critical"
  assigned_to: string | null
  created_by: string | null
  scheduled_date: string | null
  completed_date: string | null
  estimated_duration_minutes: number | null
  actual_duration_minutes: number | null
  notes: string | null
  created_at: string
  updated_at: string
  assigned_profile?: { full_name: string; email: string } | null
  assets?: { name: string; location: string } | null
}

export interface ManubotCreateTaskPayload {
  title: string
  description?: string | null
  priority: "low" | "medium" | "high" | "critical"
  assigned_to?: string | null
  asset_id?: string | null
  scheduled_date?: string | null
}

export interface ManubotTeamMember {
  id: string
  full_name: string
  email: string
  role: string
}

export interface ManubotAsset {
  id: string
  name: string
  location: string
  category?: string
}

// Mapping priorità HotelAccelerator → Manubot
export const HA_TO_MANUBOT_PRIORITY: Record<string, ManubotCreateTaskPayload["priority"]> = {
  low: "low",
  normal: "medium",
  high: "high",
  urgent: "critical",
}

// Mapping status HotelAccelerator → Manubot
export const HA_TO_MANUBOT_STATUS: Record<string, ManubotTask["status"]> = {
  open: "pending",
  in_progress: "in_progress",
  done: "completed",
  cancelled: "cancelled",
}

// Mapping status Manubot → HotelAccelerator
export const MANUBOT_TO_HA_STATUS: Record<string, string> = {
  pending: "open",
  in_progress: "in_progress",
  completed: "done",
  cancelled: "cancelled",
}

// Mapping priorità Manubot → HotelAccelerator
export const MANUBOT_TO_HA_PRIORITY: Record<string, string> = {
  low: "low",
  medium: "normal",
  high: "high",
  critical: "urgent",
}

export class ManubotClient {
  private accessToken: string | null = null
  private supabaseUrl: string

  constructor(supabaseUrl?: string) {
    this.supabaseUrl = supabaseUrl || requireEnv("MANUBOT_SUPABASE_URL")
  }

  private get baseUrl(): string {
    return requireEnv("MANUBOT_BASE_URL")
  }

  /**
   * Login con credenziali Manubot — ottiene un JWT Supabase
   */
  async login(email: string, password: string): Promise<string> {
    const res = await fetch(
      `${this.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": requireEnv("MANUBOT_SUPABASE_ANON_KEY"),
        },
        body: JSON.stringify({ email, password }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Login Manubot fallito: ${err}`)
    }
    const data = await res.json()
    this.accessToken = data.access_token
    return this.accessToken!
  }

  private authHeaders() {
    if (!this.accessToken) throw new Error("Non autenticato su Manubot")
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
    }
  }

  /**
   * Crea un task su Manubot
   */
  async createTask(payload: ManubotCreateTaskPayload): Promise<ManubotTask> {
    const res = await fetch(`${this.baseUrl}/tasks/create`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Creazione task Manubot fallita: ${err}`)
    }
    return res.json()
  }

  /**
   * Aggiorna status/priorità/assegnatario di un task su Manubot
   */
  async updateTask(
    taskId: string,
    updates: Partial<Pick<ManubotTask, "status" | "priority" | "assigned_to" | "notes">>
  ): Promise<ManubotTask> {
    const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: this.authHeaders(),
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Aggiornamento task Manubot fallito: ${err}`)
    }
    return res.json()
  }

  /**
   * Lista task della company
   */
  async getTasks(): Promise<ManubotTask[]> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      headers: this.authHeaders(),
    })
    if (!res.ok) throw new Error("Errore fetch task Manubot")
    const data = await res.json()
    return Array.isArray(data) ? data : data.tasks || []
  }

  /**
   * Lista tecnici della company
   */
  async getTeam(): Promise<ManubotTeamMember[]> {
    const res = await fetch(`${this.baseUrl}/team`, {
      headers: this.authHeaders(),
    })
    if (!res.ok) throw new Error("Errore fetch team Manubot")
    const data = await res.json()
    return Array.isArray(data) ? data : data.team || []
  }

  /**
   * Lista impianti/asset
   */
  async getAssets(): Promise<ManubotAsset[]> {
    const res = await fetch(`${this.baseUrl}/assets`, {
      headers: this.authHeaders(),
    })
    if (!res.ok) throw new Error("Errore fetch asset Manubot")
    const data = await res.json()
    return Array.isArray(data) ? data : data.assets || []
  }
}

/**
 * Factory: crea un ManubotClient autenticato con le credenziali della property
 * Usato dalle API routes interne
 */
export async function getManubotClient(property: {
  manubot_email?: string | null
  manubot_password?: string | null
  manubot_supabase_url?: string | null
}): Promise<ManubotClient> {
  // Priorità alle credenziali della property; in assenza, usa le env di default.
  // Nessun fallback hardcoded: se mancano sia property che env, errore controllato.
  const email    = property.manubot_email    || requireEnv("MANUBOT_DEFAULT_EMAIL")
  const password = property.manubot_password || requireEnv("MANUBOT_DEFAULT_PASSWORD")

  const client = new ManubotClient(property.manubot_supabase_url || undefined)
  try {
    await client.login(email, password)
    return client
  } catch (e: any) {
    throw new Error(`Login Manubot fallito: ${e.message}`)
  }
}
