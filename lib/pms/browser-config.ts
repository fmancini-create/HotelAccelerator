export class BrowserConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BrowserConfigValidationError"
  }
}

function testo(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Valida soltanto il contratto del browser remoto. Non consulta registri di
 * connettori, non riconosce fornitori e non propone valori predefiniti.
 */
export function validaConfigurazioneBrowser(input: {
  name?: unknown
  webUrl?: unknown
  isActive?: unknown
}): { name: string; webUrl: string; isActive: boolean } {
  const name = testo(input.name)
  if (!name) throw new BrowserConfigValidationError("Inserisci il nome del gestionale.")
  if (name.length > 100) throw new BrowserConfigValidationError("Il nome del gestionale è troppo lungo.")

  const rawUrl = testo(input.webUrl)
  if (!rawUrl) throw new BrowserConfigValidationError("Inserisci l'indirizzo web del gestionale.")

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new BrowserConfigValidationError("L'indirizzo web del gestionale non è valido.")
  }

  if (url.protocol !== "https:") {
    throw new BrowserConfigValidationError("L'indirizzo web del gestionale deve usare https.")
  }
  if (url.username || url.password) {
    throw new BrowserConfigValidationError("Non inserire username o password nell'indirizzo del gestionale.")
  }

  return { name, webUrl: url.toString(), isActive: input.isActive === true }
}
