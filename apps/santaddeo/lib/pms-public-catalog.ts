/**
 * Catalogo PUBBLICO dei gestionali (PMS) integrati con SANTADDEO.
 *
 * Fonte unica di verita': tabella `public.pms_public_catalog` (vedi
 * scripts/2026-05-29-create-pms-public-catalog.sql). E' una vetrina
 * COMMERCIALE, separata dal registry tecnico dei connettori
 * (`public.pms_providers`). Qui NON si nominano i connettori intermedi:
 * compaiono solo i nomi dei gestionali lato cliente.
 */

export type PmsPublicStatus = "connected" | "certifying" | "upcoming"

export interface PmsPublicEntry {
  id: string
  name: string
  slug: string
  status: PmsPublicStatus
  note: string | null
  display_order: number
  is_public: boolean
}

export interface PmsPublicGroups {
  connected: PmsPublicEntry[]
  certifying: PmsPublicEntry[]
  upcoming: PmsPublicEntry[]
}

/** Metadati di presentazione per ciascuno stato (label + ordine dei gruppi). */
export const PMS_STATUS_META: Record<
  PmsPublicStatus,
  { label: string; description: string; order: number }
> = {
  connected: {
    label: "Connessi e operativi",
    description: "Integrazione attiva: SANTADDEO si collega e sincronizza i dati.",
    order: 1,
  },
  certifying: {
    label: "In fase di certificazione",
    description: "Integrazione in corso di certificazione con il fornitore.",
    order: 2,
  },
  upcoming: {
    label: "Prossime integrazioni",
    description: "Gestionali in roadmap, in arrivo prossimamente.",
    order: 3,
  },
}

/** Raggruppa e ordina le voci per stato. */
export function groupPmsEntries(entries: PmsPublicEntry[]): PmsPublicGroups {
  const sorted = [...entries].sort((a, b) => a.display_order - b.display_order)
  return {
    connected: sorted.filter((e) => e.status === "connected"),
    certifying: sorted.filter((e) => e.status === "certifying"),
    upcoming: sorted.filter((e) => e.status === "upcoming"),
  }
}
