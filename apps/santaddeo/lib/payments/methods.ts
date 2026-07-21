// Modalità di pagamento predefinite per il Registro Pagamenti.
// Valore (slug) salvato a DB + etichetta mostrata in UI. "altro" = testo libero.
export const PAYMENT_METHODS = [
  { value: "bonifico", label: "Bonifico" },
  { value: "carta", label: "Carta" },
  { value: "contanti", label: "Contanti" },
  { value: "assegno", label: "Assegno" },
  { value: "paypal", label: "PayPal" },
  { value: "stripe", label: "Stripe" },
  { value: "rid_sdd", label: "RID / SDD" },
  { value: "altro", label: "Altro" },
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"]

const LABELS = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]))

/** Etichetta leggibile per un valore di metodo; fallback al valore grezzo. */
export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—"
  return LABELS.get(value) ?? value
}
