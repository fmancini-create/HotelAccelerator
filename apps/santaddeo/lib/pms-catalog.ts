// Catalogo centralizzato di tutti i PMS supportati
export interface PmsCatalogEntry {
  name: string
  code: string
  docType: string
  auth: string
  endpoints: string
  facilityScore: 1 | 2 | 3 | 4 | 5
  priority: "high" | "medium" | "low"
  notes?: string
  docUrl?: string
}

export const PMS_CATALOG: PmsCatalogEntry[] = [
  // --- Priority: HIGH ---
  { name: "BRiG", code: "brig", docType: "PDF / Swagger", auth: "API Key (header x-api-key) + Structure ID", endpoints: "Reservations, RoomTypes, RatePlans, OTA codes", facilityScore: 5, priority: "high", notes: "Bridge unico verso 10+ PMS (Bedzzle, Cloudbeds, Mews, Octorate, Apaleo, Opera, Passepartout, 5stelle, Slope, Zak, HotelCube). Una sola integrazione per tutti." },
  { name: "Scidoo", code: "scidoo", docType: "PDF", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", notes: "Primo PMS integrato" },
  { name: "Octorate", code: "octorate", docType: "Swagger / ReDoc", auth: "OAuth2 / token", endpoints: "Bookings, Rates, Availability", facilityScore: 5, priority: "high", notes: "API-first, documentazione eccellente", docUrl: "https://api.octorate.com/connect/docs/" },
  { name: "Beddzle", code: "beddzle", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "high", notes: "PMS italiano" },
  { name: "Mews", code: "mews", docType: "GitBook", auth: "OAuth 2.0", endpoints: "Bookings, Rates, Availability", facilityScore: 5, priority: "high", notes: "API moderna, ottima doc", docUrl: "https://mews-systems.gitbook.io/connector-api/" },
  { name: "Apaleo", code: "apaleo", docType: "Swagger", auth: "OAuth 2.0", endpoints: "Bookings, Rates, Availability", facilityScore: 5, priority: "high", notes: "Open hospitality cloud", docUrl: "https://api.apaleo.com/" },
  { name: "Guesty", code: "guesty", docType: "HTML (Reference)", auth: "OAuth2 / token", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", notes: "VR + hospitality", docUrl: "https://open-api-docs.guesty.com/" },
  { name: "Hostaway", code: "hostaway", docType: "HTML (Dev portal)", auth: "Account + Secret Key", endpoints: "Listings, Reservations, Calendar, Rates", facilityScore: 4, priority: "high", docUrl: "https://api.hostaway.com/documentation" },
  { name: "Beds24", code: "beds24", docType: "HTML (Docs)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", docUrl: "https://wiki.beds24.com/index.php/REST_API" },
  { name: "Amenitiz", code: "amenitiz", docType: "HTML (Dev hub)", auth: "OAuth / token", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", docUrl: "https://developers.amenitiz.com/" },
  { name: "StayNTouch", code: "stayntouch", docType: "HTML (Dev portal)", auth: "OAuth2 / token", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", docUrl: "https://developer.stayntouch.com/" },
  { name: "OwnerRez", code: "ownerrez", docType: "HTML (Docs)", auth: "Personal Access Token / OAuth", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "high", docUrl: "https://www.ownerrez.com/support/articles/api-overview" },
  { name: "SiteMinder", code: "siteminder", docType: "HTML (Dev portal)", auth: "OAuth2 / partner app", endpoints: "Availability, Rates, Bookings", facilityScore: 3, priority: "high", docUrl: "https://developer.siteminder.com/" },
  // --- Priority: MEDIUM ---
  { name: "5stelle", code: "5stelle", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", notes: "Diffuso in Italia (Zucchetti)" },
  { name: "Booking Expert", code: "booking-expert", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Bookingfor", code: "bookingfor", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Ciaobooking", code: "ciaobooking", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "medium" },
  { name: "Cloudbeds", code: "cloudbeds", docType: "Developer Hub", auth: "OAuth 2.0", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "medium", docUrl: "https://developers.cloudbeds.com/" },
  { name: "Ericsoft", code: "ericsoft", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", notes: "PMS italiano per catene" },
  { name: "Ezee Absolute", code: "ezee", docType: "HTML (Dev portal)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://www.ezeetechnosys.com/connectivity/" },
  { name: "Fidelity by GP Dati", code: "gp-dati", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", notes: "Enterprise italiano" },
  { name: "Guesty Booking Engine", code: "guesty_be", docType: "HTML (Dev portal)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 4, priority: "medium", docUrl: "https://booking-api-docs.guesty.com/docs/quick-start" },
  { name: "Hotelogix", code: "hotelogix", docType: "HTML/PDF (Dev docs)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://www.hotelogix.com/developers/" },
  { name: "Hoteltime", code: "hoteltime", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Hotel Runner", code: "hotel-runner", docType: "HTML + Postman", auth: "API Key / token", endpoints: "Reservations, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://developers.hotelrunner.com/" },
  { name: "iRicevere", code: "iricevere", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Kross Booking", code: "kross-booking", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Little Hotelier", code: "little-hotelier", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Lodgify", code: "lodgify", docType: "HTML (Docs)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://docs.lodgify.com/reference" },
  { name: "Newbook (REST API)", code: "newbook_rest", docType: "HTML (Dev portal)", auth: "HTTP Basic / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://developers.newbook.cloud/rest.php" },
  { name: "Passepartout Welcome", code: "passepartout", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", notes: "PMS italiano" },
  { name: "Protel", code: "protel", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Rentals United", code: "rentals_united", docType: "HTML (Docs)", auth: "API credentials", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://docs.rentalsunited.com/" },
  { name: "Roomcloud", code: "roomcloud", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium" },
  { name: "Smoobu", code: "smoobu", docType: "HTML (Docs)", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", docUrl: "https://docs.smoobu.com/" },
  { name: "Streamline (VRS)", code: "streamline", docType: "HTML (Feature+portal)", auth: "Partner credentials", endpoints: "Reservations, Calendars, Availability", facilityScore: 3, priority: "medium", docUrl: "https://www.streamlinevrs.com/features/open-api/" },
  { name: "Uplisting", code: "uplisting", docType: "Postman + HTML", auth: "API Key", endpoints: "Rates, Availability, Bookings", facilityScore: 4, priority: "medium", docUrl: "https://documenter.getpostman.com/view/1320372/SWTBfdW6" },
  { name: "Avantio", code: "avantio", docType: "HTML (API info)", auth: "Docs on request / partner", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "medium", docUrl: "https://www.avantio.com/api-integrations/" },
  { name: "Vertical Booking", code: "vertical-booking", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "medium", notes: "CRS italiano" },
  // --- Priority: LOW ---
  { name: "Clock PMS+", code: "clock-pms", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
  { name: "Hotexa", code: "hotexa", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "Infor HMS", code: "infor-hms", docType: "HTML", auth: "OAuth 2.0", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low", notes: "Enterprise, resort di lusso" },
  { name: "InnRoad", code: "innroad", docType: "HTML (support)", auth: "API subscription", endpoints: "Reservations, Availability, Rates", facilityScore: 2, priority: "low", docUrl: "https://support.innroad.com/" },
  { name: "Leonardo Hotel Manager", code: "leonardo", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "Newbook (OTA API)", code: "newbook_ota", docType: "HTML (Dev portal)", auth: "HTTP Basic / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://developers.newbook.cloud/ota.php" },
  { name: "Opera PMS (Oracle)", code: "opera", docType: "HTML + GitHub", auth: "OAuth 2.0 / API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low", notes: "Enterprise, complesso", docUrl: "https://docs.oracle.com/en/industries/hospitality/opera-cloud/" },
  { name: "RateBoard", code: "rateboard", docType: "HTML", auth: "API Key", endpoints: "Rates, Revenue", facilityScore: 3, priority: "low" },
  { name: "RealPage", code: "realpage", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "Reconline", code: "reconline", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "RMS Cloud", code: "rms-cloud", docType: "Postman / HTML", auth: "OAuth 2.0", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
  { name: "RoomRaccoon", code: "roomraccoon", docType: "HTML (3rd-party)", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "Semplice Hotel", code: "semplice", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "Slope", code: "slope", docType: "HTML / PDF", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://www.slope.it/" },
  { name: "SmartHotel", code: "smarthotel", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
  { name: "Staah", code: "staah", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
  { name: "Vikey", code: "vikey", docType: "HTML", auth: "API Key", endpoints: "Self check-in, Domotica", facilityScore: 3, priority: "low" },
  { name: "WuBook / Zak", code: "wubook", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://wubook.net/wired/" },
  { name: "Xenion", code: "xenion", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
  { name: "Zak by WuBook", code: "zak", docType: "HTML", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://zak.wubook.net/" },
  { name: "Escapia Gateway", code: "escapia", docType: "HTML (Dev portal)", auth: "Partner credentials", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://developer.escapia.com/" },
  { name: "Hostfully", code: "hostfully", docType: "HTML (Docs/Dev)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://www.hostfully.com/api/" },
  { name: "Hostify", code: "hostify", docType: "HTML (Docs/feature)", auth: "API Key", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://hostify.com/features/api" },
  { name: "Tokeet", code: "tokeet", docType: "HTML (Docs)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low", docUrl: "https://apidocs.tokeet.com/" },
  { name: "Checkfront", code: "checkfront", docType: "PDF + GitHub", auth: "API Key / token", endpoints: "Bookings, Availability", facilityScore: 3, priority: "low", docUrl: "https://apiv4.checkfront.com" },
  { name: "ResNexus", code: "resnexus", docType: "HTML (Implementation)", auth: "Credentials + approval", endpoints: "Reservations, Availability, Rates", facilityScore: 2, priority: "low" },
  { name: "WebRezPro", code: "webrezpro", docType: "PDF", auth: "API Key (merchant)", endpoints: "Reservations, Rates, Availability", facilityScore: 2, priority: "low" },
  { name: "eZee FrontDesk", code: "ezee_frontdesk", docType: "HTML (Dev portal)", auth: "API Key / token", endpoints: "Bookings, Rates, Availability", facilityScore: 3, priority: "low" },
]

// Helper per ottenere le stelle di facilità
export function getFacilityStars(score: number): string {
  return "★".repeat(score) + "☆".repeat(5 - score)
}

// Helper per ottenere i PMS non ancora configurati
export function getAvailablePms(configuredCodes: string[]): PmsCatalogEntry[] {
  return PMS_CATALOG.filter((pms) => !configuredCodes.includes(pms.code))
}
