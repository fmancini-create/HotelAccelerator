/**
 * Tassonomia strutture ricettive + categoria stelle + regioni italiane.
 *
 * IMPORTANTE: i valori `value` qui devono restare allineati con il CHECK
 * constraint `hotels_hotel_type_check` definito in
 * `scripts/2026-05-12-add-hotel-contact-categorization.sql`. Se aggiungi
 * un nuovo tipo qui, aggiorna anche la migration.
 *
 * "starsApplicable: false" indica strutture che per legge italiana NON
 * hanno classificazione a stelle (es. casa vacanze, agriturismo, B&B).
 * In quei casi la UI nasconde lo Select stelle e salva stars=NULL.
 */

export interface HotelTypeOption {
  value: string
  label: string
  /** Se false, il selettore stelle viene nascosto dalla UI. */
  starsApplicable: boolean
  /** Aiuto inline per il manager hotel in fase di onboarding. */
  description?: string
}

export const HOTEL_TYPES: HotelTypeOption[] = [
  { value: "hotel", label: "Hotel", starsApplicable: true, description: "Struttura alberghiera tradizionale" },
  { value: "resort", label: "Resort", starsApplicable: true, description: "Hotel con ampi spazi comuni e servizi vacanza" },
  { value: "boutique", label: "Boutique Hotel", starsApplicable: true, description: "Hotel di piccole dimensioni a forte caratterizzazione" },
  { value: "residence", label: "Residence / Aparthotel", starsApplicable: true, description: "Strutture con unità abitative dotate di cucina" },
  { value: "villaggio", label: "Villaggio Turistico", starsApplicable: true },
  { value: "bb", label: "Bed & Breakfast", starsApplicable: false, description: "Strutture extra-alberghiere" },
  { value: "agriturismo", label: "Agriturismo", starsApplicable: false, description: "Strutture extra-alberghiere legate ad attività agricola" },
  { value: "casa_vacanze", label: "Casa Vacanze / Locazione Turistica", starsApplicable: false, description: "Locazioni turistiche extra-alberghiere" },
  { value: "appartamenti", label: "Appartamenti / CAV", starsApplicable: false },
  { value: "camping", label: "Camping / Glamping", starsApplicable: false },
  { value: "hostel", label: "Ostello", starsApplicable: false },
  { value: "altro", label: "Altro", starsApplicable: false },
]

export function getHotelTypeOption(value: string | null | undefined): HotelTypeOption | undefined {
  if (!value) return undefined
  return HOTEL_TYPES.find((t) => t.value === value)
}

export function hotelTypeSupportsStars(value: string | null | undefined): boolean {
  return getHotelTypeOption(value)?.starsApplicable ?? false
}

export const HOTEL_STARS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 stella" },
  { value: 2, label: "2 stelle" },
  { value: 3, label: "3 stelle" },
  { value: 4, label: "4 stelle" },
  { value: 5, label: "5 stelle" },
]

/**
 * Province italiane raggruppate per regione (sigla -> nome lungo).
 * Usato dal selettore Provincia/Regione in onboarding. Lista ufficiale
 * ISTAT 2024 (107 province + 14 città metropolitane). Sicilia, Sardegna
 * e regioni con consorzi/aree metropolitane sono inclusi come province
 * comuni per semplicità di UX.
 */
export interface RegionEntry {
  region: string
  provinces: { code: string; name: string }[]
}

export const ITALIAN_REGIONS: RegionEntry[] = [
  {
    region: "Abruzzo",
    provinces: [
      { code: "AQ", name: "L'Aquila" },
      { code: "CH", name: "Chieti" },
      { code: "PE", name: "Pescara" },
      { code: "TE", name: "Teramo" },
    ],
  },
  {
    region: "Basilicata",
    provinces: [
      { code: "MT", name: "Matera" },
      { code: "PZ", name: "Potenza" },
    ],
  },
  {
    region: "Calabria",
    provinces: [
      { code: "CS", name: "Cosenza" },
      { code: "CZ", name: "Catanzaro" },
      { code: "KR", name: "Crotone" },
      { code: "RC", name: "Reggio Calabria" },
      { code: "VV", name: "Vibo Valentia" },
    ],
  },
  {
    region: "Campania",
    provinces: [
      { code: "AV", name: "Avellino" },
      { code: "BN", name: "Benevento" },
      { code: "CE", name: "Caserta" },
      { code: "NA", name: "Napoli" },
      { code: "SA", name: "Salerno" },
    ],
  },
  {
    region: "Emilia-Romagna",
    provinces: [
      { code: "BO", name: "Bologna" },
      { code: "FC", name: "Forlì-Cesena" },
      { code: "FE", name: "Ferrara" },
      { code: "MO", name: "Modena" },
      { code: "PC", name: "Piacenza" },
      { code: "PR", name: "Parma" },
      { code: "RA", name: "Ravenna" },
      { code: "RE", name: "Reggio Emilia" },
      { code: "RN", name: "Rimini" },
    ],
  },
  {
    region: "Friuli-Venezia Giulia",
    provinces: [
      { code: "GO", name: "Gorizia" },
      { code: "PN", name: "Pordenone" },
      { code: "TS", name: "Trieste" },
      { code: "UD", name: "Udine" },
    ],
  },
  {
    region: "Lazio",
    provinces: [
      { code: "FR", name: "Frosinone" },
      { code: "LT", name: "Latina" },
      { code: "RI", name: "Rieti" },
      { code: "RM", name: "Roma" },
      { code: "VT", name: "Viterbo" },
    ],
  },
  {
    region: "Liguria",
    provinces: [
      { code: "GE", name: "Genova" },
      { code: "IM", name: "Imperia" },
      { code: "SP", name: "La Spezia" },
      { code: "SV", name: "Savona" },
    ],
  },
  {
    region: "Lombardia",
    provinces: [
      { code: "BG", name: "Bergamo" },
      { code: "BS", name: "Brescia" },
      { code: "CO", name: "Como" },
      { code: "CR", name: "Cremona" },
      { code: "LC", name: "Lecco" },
      { code: "LO", name: "Lodi" },
      { code: "MB", name: "Monza e Brianza" },
      { code: "MI", name: "Milano" },
      { code: "MN", name: "Mantova" },
      { code: "PV", name: "Pavia" },
      { code: "SO", name: "Sondrio" },
      { code: "VA", name: "Varese" },
    ],
  },
  {
    region: "Marche",
    provinces: [
      { code: "AN", name: "Ancona" },
      { code: "AP", name: "Ascoli Piceno" },
      { code: "FM", name: "Fermo" },
      { code: "MC", name: "Macerata" },
      { code: "PU", name: "Pesaro e Urbino" },
    ],
  },
  {
    region: "Molise",
    provinces: [
      { code: "CB", name: "Campobasso" },
      { code: "IS", name: "Isernia" },
    ],
  },
  {
    region: "Piemonte",
    provinces: [
      { code: "AL", name: "Alessandria" },
      { code: "AT", name: "Asti" },
      { code: "BI", name: "Biella" },
      { code: "CN", name: "Cuneo" },
      { code: "NO", name: "Novara" },
      { code: "TO", name: "Torino" },
      { code: "VB", name: "Verbano-Cusio-Ossola" },
      { code: "VC", name: "Vercelli" },
    ],
  },
  {
    region: "Puglia",
    provinces: [
      { code: "BA", name: "Bari" },
      { code: "BR", name: "Brindisi" },
      { code: "BT", name: "Barletta-Andria-Trani" },
      { code: "FG", name: "Foggia" },
      { code: "LE", name: "Lecce" },
      { code: "TA", name: "Taranto" },
    ],
  },
  {
    region: "Sardegna",
    provinces: [
      { code: "CA", name: "Cagliari" },
      { code: "NU", name: "Nuoro" },
      { code: "OR", name: "Oristano" },
      { code: "SS", name: "Sassari" },
      { code: "SU", name: "Sud Sardegna" },
    ],
  },
  {
    region: "Sicilia",
    provinces: [
      { code: "AG", name: "Agrigento" },
      { code: "CL", name: "Caltanissetta" },
      { code: "CT", name: "Catania" },
      { code: "EN", name: "Enna" },
      { code: "ME", name: "Messina" },
      { code: "PA", name: "Palermo" },
      { code: "RG", name: "Ragusa" },
      { code: "SR", name: "Siracusa" },
      { code: "TP", name: "Trapani" },
    ],
  },
  {
    region: "Toscana",
    provinces: [
      { code: "AR", name: "Arezzo" },
      { code: "FI", name: "Firenze" },
      { code: "GR", name: "Grosseto" },
      { code: "LI", name: "Livorno" },
      { code: "LU", name: "Lucca" },
      { code: "MS", name: "Massa-Carrara" },
      { code: "PI", name: "Pisa" },
      { code: "PO", name: "Prato" },
      { code: "PT", name: "Pistoia" },
      { code: "SI", name: "Siena" },
    ],
  },
  {
    region: "Trentino-Alto Adige",
    provinces: [
      { code: "BZ", name: "Bolzano" },
      { code: "TN", name: "Trento" },
    ],
  },
  {
    region: "Umbria",
    provinces: [
      { code: "PG", name: "Perugia" },
      { code: "TR", name: "Terni" },
    ],
  },
  {
    region: "Valle d'Aosta",
    provinces: [{ code: "AO", name: "Aosta" }],
  },
  {
    region: "Veneto",
    provinces: [
      { code: "BL", name: "Belluno" },
      { code: "PD", name: "Padova" },
      { code: "RO", name: "Rovigo" },
      { code: "TV", name: "Treviso" },
      { code: "VE", name: "Venezia" },
      { code: "VI", name: "Vicenza" },
      { code: "VR", name: "Verona" },
    ],
  },
]

/** Trova la regione dato il codice provincia (es. "FI" -> "Toscana") */
export function getRegionByProvinceCode(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.toUpperCase()
  for (const r of ITALIAN_REGIONS) {
    if (r.provinces.some((p) => p.code === upper)) return r.region
  }
  return null
}
