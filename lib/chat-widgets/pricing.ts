/**
 * Prezzo di un widget chat aggiuntivo, in centesimi.
 *
 * Vive in un file senza `server-only` perche' serve in due posti: il server lo
 * manda a Stripe (ed e' quello che fa fede), il pannello lo mostra all'admin.
 * Una sola fonte: se il prezzo cambia e ci fossero due copie, il pannello
 * mostrerebbe una cifra e Stripe ne addebiterebbe un'altra.
 *
 * Attenzione: mostrarlo al cliente non vuol dire fidarsi di cio' che il browser
 * rimanda indietro. La rotta di pagamento usa SEMPRE questa costante lato
 * server, mai un importo ricevuto nella richiesta.
 */
export const PREZZO_WIDGET_EXTRA_CENTESIMI = 900 // 9 euro al mese

/** Prezzo formattato per l'interfaccia, es. "9 €". */
export function prezzoWidgetExtraLeggibile(): string {
  return `${(PREZZO_WIDGET_EXTRA_CENTESIMI / 100).toFixed(0)} €`
}
