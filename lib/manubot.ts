/**
 * Manubot API Client
 * Base URL: https://manubot.it/api
 * Auth: Supabase JWT (login con email/password della company)
 */

import { decryptManubotPassword } from "@/lib/manubot/credential-secrets"
import { validateManubotSupabaseUrlForEnvironment } from "@/lib/manubot/environment-guard"
import { ManubotUpstreamError, upstreamErrorFromResponse } from "@/lib/manubot/upstream-error"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Configurazione Manubot mancante: variabile ambiente ${name} non impostata`)
  }
  return value
}

export interface ManubotTaskPhoto {
  url: string
  filename: string
  size: number
  type: string
}

export interface ManubotTask {
  id: string
  company_id: string
  title: string
  description: string | null
  status: "pending" | "in_progress" | "completed" | "cancelled"
  /** Nome esatto della priorita configurata nel tenant ManuBot. */
  priority: string
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

/**
 * Contratto reale del form task ManuBot (settembre 2026).
 * `expected_resolution_minutes` resta opzionale lato client per non rompere i
 * vecchi chiamanti HotelAccelerator: `createTask` applica 60 minuti quando il
 * chiamante legacy non lo valorizza, mentre il nuovo popup lo invia sempre.
 */
export interface ManubotCreateTaskPayload {
  title: string
  description?: string | null
  /** Nome esatto di `priority_levels.name` del tenant ManuBot. */
  priority: string
  assigned_to?: string | null
  operator_group_id?: string | null
  assignee_ids?: string[]
  group_ids?: string[]
  asset_id?: string | null
  asset_ids?: string[]
  asset_category_id?: string | null
  property_id?: string | null
  photos?: ManubotTaskPhoto[]
  requires_completion_photo?: boolean
  procedure_ids?: string[]
  expected_resolution_minutes?: number
  client_request_id?: string
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
  property_id?: string | null
}

export interface ManubotAssetCategory {
  id: string
  name: string
  icon?: string | null
  color?: string | null
}

export interface ManubotOperatorGroup {
  id: string
  name: string
  color?: string | null
  member_count?: number | null
}

export interface ManubotPropertyOption {
  id: string
  name: string
  type?: string | null
}

export interface ManubotProcedureOption {
  id: string
  title: string
}

export interface ManubotPriorityOption {
  id: string
  name: string
  label: string | null
  description?: string | null
  color?: string | null
  response_time_hours?: number | null
  sort_order?: number | null
  is_active?: boolean
  is_system_default?: boolean
}

export interface ManubotTaskFormData {
  operators: Array<{ id: string; full_name: string | null }>
  assets: ManubotAsset[]
  priorities: ManubotPriorityOption[]
  assetCategories: ManubotAssetCategory[]
  operatorGroups: ManubotOperatorGroup[]
  properties: ManubotPropertyOption[]
  procedures: ManubotProcedureOption[]
}

/** Mapping legacy HotelAccelerator -> nomi standard ManuBot. Non usarlo nei
 * moduli che ricevono le priorita reali dal tenant (es. Recensioni). */
export const HA_TO_MANUBOT_PRIORITY: Record<string, string> = {
  low: "low",
  normal: "medium",
  high: "high",
  urgent: "critical",
}

export const HA_TO_MANUBOT_STATUS: Record<string, ManubotTask["status"]> = {
  open: "pending",
  in_progress: "in_progress",
  done: "completed",
  cancelled: "cancelled",
}

export const MANUBOT_TO_HA_STATUS: Record<string, string> = {
  pending: "open",
  in_progress: "in_progress",
  completed: "done",
  cancelled: "cancelled",
}

export const MANUBOT_TO_HA_PRIORITY: Record<string, string> = {
  low: "low",
  medium: "normal",
  high: "high",
  critical: "urgent",
}

export class ManubotClient {
  private accessToken: string | null = null
  private supabaseUrl: string
  private companyId: string | null

  constructor(supabaseUrl?: string, companyId?: string | null) {
    this.supabaseUrl = supabaseUrl || requireEnv("MANUBOT_SUPABASE_URL")
    this.companyId = companyId?.trim() || null
  }

  private get baseUrl(): string {
    return requireEnv("MANUBOT_BASE_URL")
  }

  async login(email: string, password: string): Promise<string> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": requireEnv("MANUBOT_SUPABASE_ANON_KEY"),
      },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      throw await upstreamErrorFromResponse("login", "/auth/v1/token", res, { isLoginPhase: true })
    }
    const data = await res.json()
    this.accessToken = data.access_token
    return this.accessToken!
  }

  private authHeaders(json = true): Record<string, string> {
    if (!this.accessToken) throw new Error("Non autenticato su Manubot")
    if (!this.companyId) {
      throw new Error("Configurazione Manubot tenant incompleta: manubot_company_id mancante")
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "X-ManuBot-Company-Id": this.companyId,
    }
    if (json) headers["Content-Type"] = "application/json"
    return headers
  }

  async createTask(payload: ManubotCreateTaskPayload, idempotencyKey?: string): Promise<ManubotTask> {
    const headers = this.authHeaders()
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey

    const normalizedPayload: ManubotCreateTaskPayload = {
      ...payload,
      expected_resolution_minutes: payload.expected_resolution_minutes ?? 60,
    }

    const res = await fetch(`${this.baseUrl}/tasks/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(normalizedPayload),
    })
    if (!res.ok) throw await upstreamErrorFromResponse("tasks/create", "/tasks/create", res)

    const data = await res.json()
    const task = data?.task ?? (Array.isArray(data?.tasks) ? data.tasks[0] : data)
    if (!task?.id) throw new Error("ManuBot non ha restituito l'id del task creato")
    return task as ManubotTask
  }

  async getTaskFormData(): Promise<ManubotTaskFormData> {
    const res = await fetch(`${this.baseUrl}/new-task-data`, {
      headers: this.authHeaders(),
      cache: "no-store",
    })
    if (!res.ok) throw await upstreamErrorFromResponse("new-task-data", "/new-task-data", res)
    const data = await res.json()
    return {
      operators: data?.operators || [],
      assets: data?.assets || [],
      priorities: data?.priorities || [],
      assetCategories: data?.assetCategories || [],
      operatorGroups: data?.operatorGroups || [],
      properties: data?.properties || [],
      procedures: data?.procedures || [],
    }
  }

  async uploadTaskPhotos(files: File[]): Promise<ManubotTaskPhoto[]> {
    const form = new FormData()
    files.forEach((file) => form.append("files", file))

    const res = await fetch(`${this.baseUrl}/tasks/upload-photos`, {
      method: "POST",
      headers: this.authHeaders(false),
      body: form,
    })
    if (!res.ok) throw await upstreamErrorFromResponse("tasks/upload-photos", "/tasks/upload-photos", res)
    const data = await res.json()
    return Array.isArray(data?.photos) ? data.photos : []
  }

  async updateTask(
    taskId: string,
    updates: Partial<Pick<ManubotTask, "status" | "priority" | "assigned_to" | "notes">>,
  ): Promise<ManubotTask> {
    const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: this.authHeaders(),
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw await upstreamErrorFromResponse("tasks/update", "/tasks/{id}", res)
    return res.json()
  }

  async getTasks(): Promise<ManubotTask[]> {
    const res = await fetch(`${this.baseUrl}/tasks`, { headers: this.authHeaders() })
    if (!res.ok) throw await upstreamErrorFromResponse("tasks", "/tasks", res)
    const data = await res.json()
    return Array.isArray(data) ? data : data.tasks || []
  }

  async getTeam(): Promise<ManubotTeamMember[]> {
    const res = await fetch(`${this.baseUrl}/team`, { headers: this.authHeaders() })
    if (!res.ok) throw await upstreamErrorFromResponse("team", "/team", res)
    const data = await res.json()
    return Array.isArray(data) ? data : data.members || data.team || []
  }

  async getAssets(): Promise<ManubotAsset[]> {
    const res = await fetch(`${this.baseUrl}/assets`, { headers: this.authHeaders() })
    if (!res.ok) throw await upstreamErrorFromResponse("assets", "/assets", res)
    const data = await res.json()
    return Array.isArray(data) ? data : data.assets || []
  }
}

export async function getManubotClient(property: {
  manubot_email?: string | null
  manubot_password?: string | null
  manubot_supabase_url?: string | null
  manubot_company_id?: string | null
}): Promise<ManubotClient> {
  const decryptedPassword = decryptManubotPassword(property.manubot_password)
  const email = property.manubot_email || requireEnv("MANUBOT_DEFAULT_EMAIL")
  const password = decryptedPassword || requireEnv("MANUBOT_DEFAULT_PASSWORD")
  const companyId = property.manubot_company_id?.trim() || null
  if (!companyId) {
    throw new Error("Configurazione Manubot tenant incompleta: manubot_company_id mancante")
  }

  const resolvedSupabaseUrl = property.manubot_supabase_url || process.env.MANUBOT_SUPABASE_URL
  validateManubotSupabaseUrlForEnvironment(resolvedSupabaseUrl)

  const client = new ManubotClient(property.manubot_supabase_url || undefined, companyId)
  try {
    await client.login(email, password)
    return client
  } catch (e: any) {
    if (e instanceof ManubotUpstreamError) throw e
    throw new Error(`Login Manubot fallito: ${e?.message ?? "errore sconosciuto"}`)
  }
}
