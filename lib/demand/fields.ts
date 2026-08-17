/**
 * Cosa un reparto vuole estrarre dalle conversazioni.
 *
 * I campi non sono cablati nel codice: li decide l'admin sul gruppo di lavoro,
 * perché "Front Office" e "Spa" misurano cose diverse. I preset qui sotto sono
 * solo punti di partenza precompilati, non gabbie: restano tutti modificabili.
 */

export type FieldType = "text" | "date" | "number" | "enum" | "boolean"

export interface TrackingField {
  /** Chiave nel payload salvato. Stabile: rinominarla scollega lo storico. */
  key: string
  label: string
  type: FieldType
  /** Solo per type "enum". */
  options?: string[]
  /** Diventa la descrizione passata al modello: è l'istruzione vera. */
  hint?: string
}

export interface TrackingPreset {
  key: string
  label: string
  description: string
  /**
   * Campo data che colloca l'estrazione nel calendario. Deve essere la data
   * dell'EVENTO (arrivo, servizio), non quella del messaggio: un calendario
   * della domanda risponde a "quanti mi cercano per il 14 agosto", non a
   * "quanti hanno scritto oggi".
   */
  referenceField: string | null
  fields: TrackingField[]
}

const ESITO: TrackingField = {
  key: "esito",
  label: "Esito",
  type: "enum",
  options: ["aperta", "confermata", "persa", "annullata"],
  hint: "confermata solo se c'è una conferma esplicita; persa se il cliente ha rinunciato o ha scelto altro; annullata se ha disdetto; aperta in tutti gli altri casi.",
}

export const TRACKING_PRESETS: TrackingPreset[] = [
  {
    key: "domanda_ricettiva",
    label: "Domanda ricettiva (camere)",
    description: "Richieste di disponibilità, preventivi e prenotazioni di camere.",
    referenceField: "arrivo",
    fields: [
      {
        key: "tipo",
        label: "Tipo di richiesta",
        type: "enum",
        options: ["disponibilita", "preventivo", "prenotazione", "modifica", "assistenza", "altro"],
        hint: "disponibilita se chiede solo se c'è posto; preventivo se chiede un prezzo; prenotazione se conferma o ha già prenotato.",
      },
      { key: "arrivo", label: "Arrivo", type: "date", hint: "Data di arrivo richiesta. null se non indicata." },
      { key: "partenza", label: "Partenza", type: "date", hint: "Data di partenza richiesta. null se non indicata." },
      { key: "ospiti", label: "Ospiti", type: "number", hint: "Numero totale di persone. null se non indicato." },
      {
        key: "camere",
        label: "Camere",
        type: "number",
        hint: "Numero di camere richieste. null se non indicato.",
      },
      ESITO,
    ],
  },
  {
    key: "ristorante",
    label: "Ristorante (coperti)",
    description: "Prenotazioni e richieste per il ristorante.",
    referenceField: "data_servizio",
    fields: [
      { key: "data_servizio", label: "Data del servizio", type: "date" },
      { key: "ora", label: "Ora", type: "text", hint: "Formato HH:MM se indicata, altrimenti null." },
      { key: "coperti", label: "Coperti", type: "number" },
      {
        key: "servizio",
        label: "Servizio",
        type: "enum",
        options: ["pranzo", "cena", "altro"],
        hint: "Deducilo dall'ora se non è scritto: fino alle 16:00 pranzo, dopo cena.",
      },
      ESITO,
    ],
  },
  {
    key: "spa_benessere",
    label: "Spa e benessere",
    description: "Richieste di trattamenti, massaggi e accessi alla spa.",
    referenceField: "data_richiesta",
    fields: [
      { key: "data_richiesta", label: "Data desiderata", type: "date" },
      { key: "trattamento", label: "Trattamento", type: "text", hint: "Come lo ha chiamato il cliente." },
      { key: "persone", label: "Persone", type: "number" },
      ESITO,
    ],
  },
  {
    key: "eventi",
    label: "Eventi e banchetti",
    description: "Matrimoni, meeting, cene di gruppo.",
    referenceField: "data_evento",
    fields: [
      { key: "data_evento", label: "Data dell'evento", type: "date" },
      {
        key: "tipo_evento",
        label: "Tipo di evento",
        type: "enum",
        options: ["matrimonio", "meeting", "cena_gruppo", "altro"],
      },
      { key: "invitati", label: "Invitati", type: "number" },
      ESITO,
    ],
  },
  {
    key: "libero",
    label: "Personalizzato",
    description: "Nessun campo precompilato: li definisci tu.",
    referenceField: null,
    fields: [],
  },
]

export function presetByKey(key: string): TrackingPreset | null {
  return TRACKING_PRESETS.find((p) => p.key === key) ?? null
}

/**
 * Il campo che colloca l'estrazione nel tempo.
 *
 * Non è dedotto dal preset ma cercato tra i campi realmente configurati:
 * l'admin può aver rimosso il campo data del preset, e in quel caso
 * l'estrazione non ha una collocazione nel calendario — va detto, non finto.
 */
export function resolveReferenceField(fields: TrackingField[], presetKey: string): string | null {
  const preset = presetByKey(presetKey)
  if (preset?.referenceField && fields.some((f) => f.key === preset.referenceField)) {
    return preset.referenceField
  }
  return fields.find((f) => f.type === "date")?.key ?? null
}

/** Chiavi ammesse: minuscole, senza spazi. Il payload è una chiave JSON. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,39}$/.test(key)
}
