export interface PlaceSearchResult {
  place_id: string
  name: string
  formatted_address: string
  rating?: number
  user_ratings_total?: number
  photos?: string[]
  types?: string[]
  geometry?: {
    location: {
      lat: number
      lng: number
    }
  }
  website?: string
  formatted_phone_number?: string
}

/**
 * Google Places API (New) client — endpoint `places.googleapis.com/v1`.
 *
 * MIGRAZIONE 03/06/2026: prima usavamo l'endpoint LEGACY
 * (`maps.googleapis.com/maps/api/place/*`) che richiede la vecchia "Places API"
 * (`places-backend.googleapis.com`), NON più attivabile sui progetti Google
 * Cloud creati di recente -> REQUEST_DENIED perenne. Inoltre il messaggio
 * d'errore diceva di abilitare "Places API (New)", che è un'API diversa: la
 * guida contraddiceva il codice. Ora usiamo davvero Places API (New).
 *
 * Differenze chiave: richieste POST con header `X-Goog-Api-Key` +
 * `X-Goog-FieldMask`, risposta con nomi camelCase (`displayName.text`,
 * `userRatingCount`, `location.latitude/longitude`) e foto come risorsa
 * (`places/.../photos/...`) servita via endpoint `/media`.
 */
export class GooglePlacesService {
  private apiKey: string
  private static readonly BASE = "https://places.googleapis.com/v1"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private getDetailedErrorMessage(status: string, apiMessage?: string): string {
    const errorMessages: Record<string, string> = {
      PERMISSION_DENIED: `La richiesta è stata negata. Possibili cause:
        1. La "Places API (New)" non è abilitata nel tuo progetto Google Cloud
        2. La chiave API ha restrizioni che bloccano le richieste dal server
        3. La fatturazione non è abilitata sul progetto

        Per risolvere:
        - Vai su https://console.cloud.google.com/apis/library/places.googleapis.com
        - Abilita "Places API (New)"
        - Assicurati che la fatturazione sia abilitata sul progetto
        - Sulla chiave API rimuovi le restrizioni "referrer HTTP" (le richieste
          partono dal nostro server): usa "Nessuna restrizione" o restrizione
          per indirizzo IP`,
      INVALID_ARGUMENT: "La richiesta non è valida. Verifica i parametri di ricerca.",
      RESOURCE_EXHAUSTED: "Hai superato il limite di query. Verifica il tuo piano Google Cloud.",
      NOT_FOUND: "Nessun risultato trovato per la struttura indicata.",
      UNKNOWN: "Errore sconosciuto. Riprova più tardi.",
    }
    const base = errorMessages[status] || `Errore API Google Places: ${status}`
    return apiMessage ? `${base}\n\nDettaglio Google: ${apiMessage}` : base
  }

  /** Costruisce l'URL servibile di una foto (Places API New). */
  private buildPhotoUrl(photoName: string, maxWidthPx = 400): string {
    return `${GooglePlacesService.BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${this.apiKey}`
  }

  /** Normalizza un place (New) verso la nostra interfaccia stabile. */
  private mapPlace(place: any): PlaceSearchResult {
    return {
      place_id: place.id,
      name: place.displayName?.text ?? place.displayName ?? "",
      formatted_address: place.formattedAddress ?? "",
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      photos: Array.isArray(place.photos)
        ? place.photos.map((photo: any) => this.buildPhotoUrl(photo.name))
        : undefined,
      types: place.types,
      geometry: place.location
        ? { location: { lat: place.location.latitude, lng: place.location.longitude } }
        : undefined,
      website: place.websiteUri,
      formatted_phone_number: place.nationalPhoneNumber,
    }
  }

  /** Estrae status + messaggio dall'errore JSON di Places API (New). */
  private async throwFromResponse(response: Response): Promise<never> {
    let status = "UNKNOWN"
    let message: string | undefined
    try {
      const data = await response.json()
      status = data?.error?.status || status
      message = data?.error?.message
    } catch {
      // corpo non JSON: usiamo lo status HTTP
      message = `HTTP ${response.status} ${response.statusText}`
    }
    throw new Error(this.getDetailedErrorMessage(status, message))
  }

  /**
   * Search for a hotel by name and address
   */
  async searchHotel(hotelName: string, address?: string): Promise<PlaceSearchResult[]> {
    try {
      const query = address ? `${hotelName} ${address}` : hotelName
      console.log("[v0] Searching Google Places (New) for:", query)

      const response = await fetch(`${GooglePlacesService.BASE}/places:searchText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.types,places.location,places.websiteUri,places.nationalPhoneNumber",
        },
        body: JSON.stringify({
          textQuery: query,
          includedType: "lodging",
          languageCode: "it",
        }),
      })

      if (!response.ok) {
        await this.throwFromResponse(response)
      }

      const data = await response.json()
      const places: any[] = Array.isArray(data.places) ? data.places : []
      console.log("[v0] Google Places (New) returned", places.length, "results")

      return places.map((place) => this.mapPlace(place))
    } catch (error) {
      console.error("[v0] Error searching hotel on Google Places:", error)
      throw error
    }
  }

  /**
   * Get detailed information about a place
   */
  async getPlaceDetails(placeId: string): Promise<PlaceSearchResult> {
    try {
      const response = await fetch(`${GooglePlacesService.BASE}/places/${placeId}`, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,rating,userRatingCount,photos,types,location,websiteUri,nationalPhoneNumber",
        },
      })

      if (!response.ok) {
        await this.throwFromResponse(response)
      }

      const place = await response.json()
      return this.mapPlace(place)
    } catch (error) {
      console.error("[v0] Error getting place details:", error)
      throw error
    }
  }
}
