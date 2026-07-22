import { createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { ScidooClient } from "@/lib/services/scidoo-client"

// Configurazioni specifiche per ogni PMS
const PMS_DATA_CONFIGS: Record<
  string,
  {
    fields: Record<string, Array<{ pms_field: string; label: string; rms_field: string }>>
    values: Record<string, Array<{ code: string; label: string }>>
  }
> = {
  scidoo: {
    fields: {
      reservation: [
        { pms_field: "id", label: "ID Prenotazione", rms_field: "booking_id" },
        { pms_field: "checkin_date", label: "Data Check-in", rms_field: "check_in_date" },
        { pms_field: "checkout_date", label: "Data Check-out", rms_field: "check_out_date" },
        { pms_field: "creation", label: "Data Creazione", rms_field: "created_at" },
        { pms_field: "cancellation", label: "Data Cancellazione", rms_field: "cancelled_at" },
        { pms_field: "status", label: "Stato", rms_field: "status" },
        { pms_field: "room_type_id", label: "ID Tipologia Camera", rms_field: "room_type_id" },
        { pms_field: "rate_id", label: "ID Tariffa", rms_field: "rate_id" },
        { pms_field: "guest_count", label: "Numero Ospiti", rms_field: "guests_count" },
        { pms_field: "adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "children", label: "Bambini", rms_field: "children" },
        { pms_field: "daily_price", label: "Prezzi Giornalieri", rms_field: "daily_rates" },
        { pms_field: "extra_price", label: "Extra", rms_field: "extras" },
        { pms_field: "total_price", label: "Prezzo Totale", rms_field: "total_amount" },
        { pms_field: "notes", label: "Note", rms_field: "notes" },
      ],
      guest: [
        { pms_field: "id", label: "ID Ospite", rms_field: "guest_id" },
        { pms_field: "first_name", label: "Nome", rms_field: "first_name" },
        { pms_field: "last_name", label: "Cognome", rms_field: "last_name" },
        { pms_field: "email", label: "Email", rms_field: "email" },
        { pms_field: "phone", label: "Telefono", rms_field: "phone" },
        { pms_field: "mobile", label: "Cellulare", rms_field: "mobile" },
        { pms_field: "birth_date", label: "Data Nascita", rms_field: "birth_date" },
        { pms_field: "birth_place", label: "Luogo Nascita", rms_field: "birth_place" },
        { pms_field: "citizenship", label: "Cittadinanza", rms_field: "nationality" },
        { pms_field: "address", label: "Indirizzo", rms_field: "address" },
        { pms_field: "document_type", label: "Tipo Documento", rms_field: "document_type" },
        { pms_field: "document_number", label: "Numero Documento", rms_field: "document_number" },
      ],
      customer: [
        { pms_field: "id", label: "ID Cliente", rms_field: "customer_id" },
        { pms_field: "first_name", label: "Nome", rms_field: "first_name" },
        { pms_field: "last_name", label: "Cognome", rms_field: "last_name" },
        { pms_field: "company_name", label: "Ragione Sociale", rms_field: "company_name" },
        { pms_field: "email", label: "Email", rms_field: "email" },
        { pms_field: "phone", label: "Telefono", rms_field: "phone" },
        { pms_field: "tax_code", label: "Codice Fiscale", rms_field: "fiscal_code" },
        { pms_field: "vat_number", label: "Partita IVA", rms_field: "vat_number" },
        { pms_field: "sdi_code", label: "Codice SDI", rms_field: "sdi_code" },
        { pms_field: "pec", label: "PEC", rms_field: "pec_email" },
        { pms_field: "address", label: "Indirizzo", rms_field: "address" },
        { pms_field: "city", label: "Città", rms_field: "city" },
        { pms_field: "zip", label: "CAP", rms_field: "postal_code" },
        { pms_field: "country", label: "Paese", rms_field: "country" },
      ],
      booking_room: [
        { pms_field: "id", label: "ID Camera Prenotazione", rms_field: "booking_room_id" },
        { pms_field: "room_type_id", label: "ID Tipologia Camera", rms_field: "room_type_id" },
        { pms_field: "room_id", label: "ID Camera", rms_field: "room_id" },
        { pms_field: "checkin_date", label: "Data Check-in", rms_field: "check_in" },
        { pms_field: "checkout_date", label: "Data Check-out", rms_field: "check_out" },
        { pms_field: "adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "children", label: "Bambini", rms_field: "children" },
        { pms_field: "children_ages", label: "Età Bambini", rms_field: "children_ages" },
        { pms_field: "rate_id", label: "ID Tariffa", rms_field: "rate_id" },
        { pms_field: "day_price", label: "Prezzi Giornalieri", rms_field: "daily_rate" },
        { pms_field: "total_price", label: "Prezzo Totale Camera", rms_field: "room_total" },
      ],
      tax_document: [
        { pms_field: "id", label: "ID Documento", rms_field: "document_id" },
        { pms_field: "document_number", label: "Numero Documento", rms_field: "invoice_number" },
        { pms_field: "document_type", label: "Tipo Documento", rms_field: "document_type" },
        { pms_field: "document_date", label: "Data Documento", rms_field: "document_date" },
        { pms_field: "customer_id", label: "ID Cliente", rms_field: "customer_id" },
        { pms_field: "total_amount", label: "Importo Totale", rms_field: "total_amount" },
        { pms_field: "net_amount", label: "Imponibile", rms_field: "net_amount" },
        { pms_field: "vat_amount", label: "IVA", rms_field: "vat_amount" },
        { pms_field: "payment_method", label: "Metodo Pagamento", rms_field: "payment_method" },
        { pms_field: "payment_date", label: "Data Pagamento", rms_field: "payment_date" },
        { pms_field: "status", label: "Stato", rms_field: "status" },
      ],
      room_api: [
        { pms_field: "id", label: "ID Camera", rms_field: "room_id" },
        { pms_field: "name", label: "Nome Camera", rms_field: "room_name" },
        { pms_field: "room_type_id", label: "ID Tipologia", rms_field: "room_type_id" },
        { pms_field: "status", label: "Stato Camera", rms_field: "room_status" },
        { pms_field: "floor", label: "Piano", rms_field: "floor" },
      ],
      rate_api: [
        { pms_field: "id", label: "ID Tariffa", rms_field: "rate_id" },
        { pms_field: "name", label: "Nome Tariffa", rms_field: "rate_name" },
        { pms_field: "arrangement", label: "Trattamento", rms_field: "board_type" },
        { pms_field: "is_active", label: "Attiva", rms_field: "is_active" },
      ],
    },
    values: {
      booking_status: [
        { code: "1", label: "Confermata" },
        { code: "2", label: "Opzione" },
        { code: "3", label: "Waiting List" },
        { code: "4", label: "Preventivo" },
        { code: "5", label: "Cancellata" },
        { code: "6", label: "No Show" },
        { code: "7", label: "In House" },
        { code: "8", label: "Checked Out" },
        { code: "9", label: "Prepagata" },
        { code: "10", label: "Sospesa" },
        { code: "11", label: "Rifiutata" },
        { code: "12", label: "Scaduta" },
      ],
      document_type: [
        { code: "identity_card", label: "Carta d'Identità" },
        { code: "passport", label: "Passaporto" },
        { code: "driving_license", label: "Patente" },
        { code: "other", label: "Altro Documento" },
      ],
      availability: [
        { code: "available", label: "Disponibile" },
        { code: "sold", label: "Venduto" },
        { code: "blocked", label: "Bloccato" },
        { code: "stop_sale", label: "Stop Sale" },
      ],
      min_stay: [
        { code: "1", label: "1 Notte" },
        { code: "2", label: "2 Notti" },
        { code: "3", label: "3 Notti" },
      ],
      fiscal_production: [
        { code: "invoice", label: "Fattura" },
        { code: "receipt", label: "Ricevuta" },
        { code: "credit_note", label: "Nota di Credito" },
        { code: "proforma", label: "Proforma" },
        { code: "deposit", label: "Acconto" },
        { code: "city_tax", label: "Tassa Soggiorno" },
        { code: "extra", label: "Extra" },
        { code: "room", label: "Camera" },
        { code: "board", label: "Trattamento" },
        { code: "fee", label: "Commissione" },
      ],
    },
  },
  bedzzle: {
    fields: {
      reservation: [
        { pms_field: "reservation_id", label: "ID Prenotazione", rms_field: "booking_id" },
        { pms_field: "arrival_date", label: "Data Arrivo", rms_field: "check_in_date" },
        { pms_field: "departure_date", label: "Data Partenza", rms_field: "check_out_date" },
        { pms_field: "created_at", label: "Data Creazione", rms_field: "created_at" },
        { pms_field: "reservation_status", label: "Stato", rms_field: "status" },
        { pms_field: "room_category_id", label: "ID Categoria Camera", rms_field: "room_type_id" },
        { pms_field: "price_list_id", label: "ID Listino", rms_field: "rate_id" },
        { pms_field: "total_guests", label: "Numero Ospiti", rms_field: "guests_count" },
        { pms_field: "num_adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "num_children", label: "Bambini", rms_field: "children" },
        { pms_field: "total_amount", label: "Importo Totale", rms_field: "total_amount" },
        { pms_field: "notes", label: "Note", rms_field: "notes" },
      ],
      guest: [
        { pms_field: "guest_id", label: "ID Ospite", rms_field: "guest_id" },
        { pms_field: "name", label: "Nome", rms_field: "first_name" },
        { pms_field: "surname", label: "Cognome", rms_field: "last_name" },
        { pms_field: "email_address", label: "Email", rms_field: "email" },
        { pms_field: "telephone", label: "Telefono", rms_field: "phone" },
        { pms_field: "date_of_birth", label: "Data Nascita", rms_field: "birth_date" },
        { pms_field: "nationality", label: "Nazionalità", rms_field: "nationality" },
        { pms_field: "id_document_type", label: "Tipo Documento", rms_field: "document_type" },
        { pms_field: "id_document_number", label: "Numero Documento", rms_field: "document_number" },
      ],
      customer: [
        { pms_field: "customer_id", label: "ID Cliente", rms_field: "customer_id" },
        { pms_field: "business_name", label: "Ragione Sociale", rms_field: "company_name" },
        { pms_field: "contact_email", label: "Email", rms_field: "email" },
        { pms_field: "fiscal_code", label: "Codice Fiscale", rms_field: "fiscal_code" },
        { pms_field: "vat_code", label: "Partita IVA", rms_field: "vat_number" },
        { pms_field: "sdi", label: "Codice SDI", rms_field: "sdi_code" },
        { pms_field: "street_address", label: "Indirizzo", rms_field: "address" },
        { pms_field: "city_name", label: "Città", rms_field: "city" },
        { pms_field: "postal_code", label: "CAP", rms_field: "postal_code" },
      ],
      booking_room: [
        { pms_field: "booking_room_id", label: "ID Camera Prenotazione", rms_field: "booking_room_id" },
        { pms_field: "room_category_id", label: "ID Categoria Camera", rms_field: "room_type_id" },
        { pms_field: "assigned_room_id", label: "ID Camera Assegnata", rms_field: "room_id" },
        { pms_field: "arrival_date", label: "Data Arrivo", rms_field: "check_in" },
        { pms_field: "departure_date", label: "Data Partenza", rms_field: "check_out" },
        { pms_field: "num_adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "num_children", label: "Bambini", rms_field: "children" },
        { pms_field: "daily_rates", label: "Tariffe Giornaliere", rms_field: "daily_rate" },
        { pms_field: "room_total", label: "Totale Camera", rms_field: "room_total" },
      ],
      tax_document: [
        { pms_field: "invoice_id", label: "ID Fattura", rms_field: "document_id" },
        { pms_field: "invoice_number", label: "Numero Fattura", rms_field: "invoice_number" },
        { pms_field: "doc_type", label: "Tipo Documento", rms_field: "document_type" },
        { pms_field: "issue_date", label: "Data Emissione", rms_field: "document_date" },
        { pms_field: "gross_amount", label: "Importo Lordo", rms_field: "total_amount" },
        { pms_field: "net_amount", label: "Importo Netto", rms_field: "net_amount" },
        { pms_field: "tax_amount", label: "IVA", rms_field: "vat_amount" },
        { pms_field: "payment_type", label: "Tipo Pagamento", rms_field: "payment_method" },
      ],
      room_api: [
        { pms_field: "room_id", label: "ID Camera", rms_field: "room_id" },
        { pms_field: "room_name", label: "Nome Camera", rms_field: "room_name" },
        { pms_field: "room_category_id", label: "ID Categoria", rms_field: "room_type_id" },
        { pms_field: "room_status", label: "Stato Camera", rms_field: "room_status" },
      ],
      rate_api: [
        { pms_field: "price_list_id", label: "ID Listino", rms_field: "rate_id" },
        { pms_field: "price_list_name", label: "Nome Listino", rms_field: "rate_name" },
        { pms_field: "meal_plan", label: "Trattamento", rms_field: "board_type" },
        { pms_field: "active", label: "Attivo", rms_field: "is_active" },
      ],
    },
    values: {
      booking_status: [
        { code: "CONFIRMED", label: "Confermata" },
        { code: "PENDING", label: "In Attesa" },
        { code: "CANCELLED", label: "Cancellata" },
        { code: "NO_SHOW", label: "No Show" },
        { code: "CHECKED_IN", label: "Check-in Effettuato" },
        { code: "CHECKED_OUT", label: "Check-out Effettuato" },
      ],
      document_type: [
        { code: "ID_CARD", label: "Carta d'Identità" },
        { code: "PASSPORT", label: "Passaporto" },
        { code: "DRIVING_LICENSE", label: "Patente" },
      ],
      availability: [
        { code: "AVAILABLE", label: "Disponibile" },
        { code: "OCCUPIED", label: "Occupato" },
        { code: "BLOCKED", label: "Bloccato" },
      ],
      min_stay: [
        { code: "1", label: "1 Notte" },
        { code: "2", label: "2 Notti" },
        { code: "3", label: "3 Notti" },
      ],
      fiscal_production: [
        { code: "INVOICE", label: "Fattura" },
        { code: "RECEIPT", label: "Ricevuta" },
        { code: "CREDIT_NOTE", label: "Nota di Credito" },
      ],
    },
  },
  brig: {
    // BRiG e' un connector read-only di prenotazioni (no ospiti, no fiscale).
    // Schema basato su lib/connectors/brig/types.ts (BrigReservation) e
    // sui codici BRIG_STATUS / BRIG_SOURCE / BRIG_CHANNEL.
    fields: {
      reservation: [
        { pms_field: "_id", label: "ID Prenotazione (Mongo)", rms_field: "booking_id" },
        { pms_field: "reservationCode", label: "Codice Prenotazione", rms_field: "pms_booking_id" },
        { pms_field: "reservationParentCode", label: "Codice Prenotazione Padre", rms_field: "pms_parent_booking_id" },
        { pms_field: "structureId", label: "ID Struttura BRiG", rms_field: "property_id" },
        { pms_field: "checkin", label: "Data Check-in (ISO)", rms_field: "check_in_date" },
        { pms_field: "checkout", label: "Data Check-out (ISO)", rms_field: "check_out_date" },
        { pms_field: "dateReceived", label: "Data Ricezione (ISO)", rms_field: "created_at" },
        { pms_field: "status", label: "Stato (numerico)", rms_field: "status" },
        { pms_field: "originalStatus", label: "Stato (testuale)", rms_field: "status_label" },
        { pms_field: "source", label: "Origine Prenotazione", rms_field: "source" },
        { pms_field: "sourceOther", label: "Origine Custom", rms_field: "source_other" },
        { pms_field: "channelCode", label: "Canale Vendita", rms_field: "channel" },
        { pms_field: "marketCode", label: "Codice Mercato", rms_field: "market" },
        { pms_field: "roomCode", label: "Codice Camera", rms_field: "room_type_id" },
        { pms_field: "ratePlanCode", label: "Codice Tariffa", rms_field: "rate_id" },
        { pms_field: "adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "children", label: "Bambini", rms_field: "children" },
        { pms_field: "quantity", label: "Numero Camere", rms_field: "number_of_rooms" },
        { pms_field: "amount", label: "Importo Totale", rms_field: "total_amount" },
        { pms_field: "amountDetail", label: "Produzione Giornaliera (x100, ::)", rms_field: "daily_rates" },
        { pms_field: "currency", label: "Valuta", rms_field: "currency" },
      ],
      room_api: [
        { pms_field: "code", label: "Codice Camera", rms_field: "room_id" },
        { pms_field: "name", label: "Nome Camera", rms_field: "room_name" },
      ],
      rate_api: [
        { pms_field: "code", label: "Codice Tariffa", rms_field: "rate_id" },
        { pms_field: "name", label: "Nome Tariffa", rms_field: "rate_name" },
      ],
    },
    values: {
      booking_status: [
        { code: "0", label: "Confermata" },
        { code: "2", label: "No Show" },
        { code: "4", label: "Cancellata" },
        { code: "9", label: "Opzione" },
      ],
      channel: [
        { code: "0", label: "Booking.com" },
        { code: "1", label: "Expedia" },
        { code: "2", label: "HRS" },
        { code: "3", label: "Hotelbeds" },
        { code: "4", label: "Booking Engine" },
        { code: "5", label: "Altro" },
        { code: "WEB", label: "Web" },
        { code: "AGE", label: "Agenzia" },
        { code: "DIR", label: "Diretto" },
        { code: "DIT", label: "Azienda" },
        { code: "OTA", label: "OTA" },
      ],
    },
  },
  slope: {
    // Slope Partner API v1 (connettore nativo, 13/07/2026). Schema basato su
    // lib/connectors/slope/types.ts (SlopeReservation). Read prenotazioni,
    // lodging types e rate plans; push prezzi via rates-and-availability-updates.
    fields: {
      reservation: [
        { pms_field: "id", label: "ID Prenotazione (UUID)", rms_field: "booking_id" },
        { pms_field: "stayPeriod.arrival", label: "Data Arrivo", rms_field: "check_in_date" },
        { pms_field: "stayPeriod.departure", label: "Data Partenza", rms_field: "check_out_date" },
        { pms_field: "creationDate", label: "Data Creazione (ISO)", rms_field: "created_at" },
        { pms_field: "lastUpdateDate", label: "Ultima Modifica (ISO)", rms_field: "updated_at" },
        { pms_field: "isCanceled", label: "Cancellata (bool)", rms_field: "status" },
        { pms_field: "isOption", label: "Opzione (bool)", rms_field: "status_label" },
        { pms_field: "lodgingType.id", label: "ID Tipologia Alloggio", rms_field: "room_type_id" },
        { pms_field: "ratePlansByDateRange", label: "Piani Tariffari per Periodo", rms_field: "rate_id" },
        { pms_field: "guestCounts.adults", label: "Adulti", rms_field: "adults" },
        { pms_field: "guestCounts.children", label: "Bambini", rms_field: "children" },
        { pms_field: "amount", label: "Importo Totale", rms_field: "total_amount" },
        { pms_field: "pricesByDate", label: "Prezzi Giornalieri", rms_field: "daily_rates" },
        { pms_field: "saleSource", label: "Origine Vendita", rms_field: "source" },
        { pms_field: "salesChannel", label: "Canale Vendita", rms_field: "channel" },
      ],
      guest: [
        { pms_field: "primaryGuest.firstName", label: "Nome", rms_field: "first_name" },
        { pms_field: "primaryGuest.lastName", label: "Cognome", rms_field: "last_name" },
        { pms_field: "primaryGuest.email", label: "Email", rms_field: "email" },
        { pms_field: "primaryGuest.phoneNumber", label: "Telefono", rms_field: "phone" },
      ],
      room_api: [
        { pms_field: "id", label: "ID Tipologia (UUID)", rms_field: "room_id" },
        { pms_field: "name", label: "Nome Tipologia", rms_field: "room_name" },
        { pms_field: "nominalCapacity", label: "Capacità Nominale", rms_field: "capacity" },
        { pms_field: "maximumCapacity", label: "Capacità Massima", rms_field: "max_capacity" },
        { pms_field: "quantity", label: "Numero Unità", rms_field: "total_rooms" },
      ],
      rate_api: [
        { pms_field: "id", label: "ID Piano Tariffario (UUID)", rms_field: "rate_id" },
        { pms_field: "name", label: "Nome Piano Tariffario", rms_field: "rate_name" },
        { pms_field: "isDerived", label: "Derivato (bool, NO push)", rms_field: "is_derived" },
      ],
    },
    values: {
      booking_status: [
        { code: "confirmed", label: "Confermata (isCanceled=false, isOption=false)" },
        { code: "option", label: "Opzione (isOption=true)" },
        { code: "canceled", label: "Cancellata (isCanceled=true)" },
        { code: "deleted", label: "Eliminata (hard delete, via deleted-resources)" },
      ],
      sale_source: [
        { code: "DIRECT", label: "Diretto" },
        { code: "ONLINE_SALES_CHANNEL", label: "Canale Online (OTA)" },
        { code: "BOOKING_ENGINE", label: "Booking Engine" },
        { code: "AGENCY", label: "Agenzia" },
        { code: "COMPANY", label: "Azienda" },
      ],
    },
  },
}

// Template vuoto per PMS non ancora configurati
const EMPTY_TEMPLATE = {
  fields: {},
  values: {},
}

export async function GET(request: Request) {
  // Usa createServiceRoleClient per bypassare RLS (l'accesso e gia protetto dalla route /superadmin)
  const supabase = await createServiceRoleClient()
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider")?.toLowerCase() || "scidoo"
  const scope = searchParams.get("scope") || "global"
  const hotelId = searchParams.get("hotelId")

  // Ottieni la configurazione per il provider selezionato
  const pmsConfig = PMS_DATA_CONFIGS[provider] || EMPTY_TEMPLATE

  if (scope === "global") {
    // Converti i campi in formato values per la UI
    const pmsValues: Record<string, Array<{ code: string; label: string }>> = {}

    // Aggiungi i values predefiniti
    Object.entries(pmsConfig.values).forEach(([key, values]) => {
      pmsValues[key] = values
    })

    // Aggiungi i campi come "values" per le sezioni schema mapping
    Object.entries(pmsConfig.fields).forEach(([key, fields]) => {
      pmsValues[key] = fields.map((f) => ({
        code: f.pms_field,
        label: f.label,
      }))
    })

    // RMS canonical codes per ogni entity type
    const rmsCanonicalCodes: Record<string, string[]> = {
      booking_status: [
        "CONFIRMED",
        "TENTATIVE",
        "CANCELLED",
        "NO_SHOW",
        "CHECKED_IN",
        "CHECKED_OUT",
        "WAITLIST",
        "PENDING",
        "EXPIRED",
      ],
      document_type: ["IDENTITY_CARD", "PASSPORT", "DRIVING_LICENSE", "FISCAL_CODE", "OTHER"],
      availability: ["AVAILABLE", "SOLD", "BLOCKED", "STOP_SALE", "ON_REQUEST"],
      min_stay: ["1", "2", "3", "4", "5", "6", "7", "14", "21", "28"],
      fiscal_production: [
        "INVOICE",
        "RECEIPT",
        "CREDIT_NOTE",
        "PROFORMA",
        "DEPOSIT",
        "CITY_TAX",
        "ROOM",
        "BOARD",
        "EXTRA",
        "FEE",
      ],
      room_type: [],
      rate_plan: [],
      channel: [
        "DIRECT",
        "BOOKING_COM",
        "EXPEDIA",
        "AIRBNB",
        "AGODA",
        "HOTELS_COM",
        "OTA_OTHER",
        "GDS",
        "CORPORATE",
        "TRAVEL_AGENT",
        "WHOLESALER",
      ],
      // 13/07/2026: sezione "Sale Source" (saleSource enum di Slope). Codici
      // canonici = gli stessi rms_code gia' usati dalle mappature channel di
      // BRiG in DB (DIR->DIRETTO, OTA->OTA, 4->BOOKING ENGINE, AGE->AGENZIA,
      // DIT->AZIENDA), cosi' gli hotel Slope sono trattati come quelli BRiG.
      sale_source: ["DIRETTO", "OTA", "BOOKING ENGINE", "AGENZIA", "AZIENDA", "WEB", "ALTRO"],
      payment_method: ["CASH", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", "PAYPAL", "OTHER"],
      board_type: ["RO", "BB", "HB", "FB", "AI"],
      // Schema fields per le entità API
      reservation: [
        "booking_id",
        "check_in_date",
        "check_out_date",
        "created_at",
        "cancelled_at",
        "status",
        "room_type_id",
        "rate_id",
        "guests_count",
        "adults",
        "children",
        "daily_rates",
        "extras",
        "total_amount",
        "notes",
      ],
      guest: [
        "guest_id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "mobile",
        "birth_date",
        "birth_place",
        "nationality",
        "address",
        "document_type",
        "document_number",
      ],
      customer: [
        "customer_id",
        "first_name",
        "last_name",
        "company_name",
        "email",
        "phone",
        "fiscal_code",
        "vat_number",
        "sdi_code",
        "pec_email",
        "address",
        "city",
        "postal_code",
        "country",
      ],
      booking_room: [
        "booking_room_id",
        "room_type_id",
        "room_id",
        "check_in",
        "check_out",
        "adults",
        "children",
        "children_ages",
        "rate_id",
        "daily_rate",
        "room_total",
      ],
      tax_document: [
        "document_id",
        "invoice_number",
        "document_type",
        "document_date",
        "customer_id",
        "total_amount",
        "net_amount",
        "vat_amount",
        "payment_method",
        "payment_date",
        "status",
      ],
      room_api: ["room_id", "room_name", "room_type_id", "room_status", "floor"],
      rate_api: ["rate_id", "rate_name", "board_type", "is_active"],
    }

    return NextResponse.json({
      provider,
      scope,
      values: pmsValues,
      fields: pmsConfig.fields,
      rmsCanonicalCodes,
    })
  }

  // Se scope = hotel, scarica i dati specifici dall'API o dal GSheet del PMS
  if (scope === "hotel") {
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto per scope hotel" }, { status: 400 })
    }

    // Use service role client for credential lookups - bypasses RLS
    const adminSupabase = await createServiceRoleClient()

    // 1. Leggi la pms_integration per questo hotel per capire il integration_mode
    const { data: integration, error: integrationError } = await adminSupabase
      .from("pms_integrations")
      .select("id, pms_name, integration_mode, api_key, property_id, config, endpoint_url, gsheet_spreadsheet_id, gsheet_spreadsheet_url")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    console.log("[v0] Hotel scope - hotelId:", hotelId, "provider:", provider, "integration_mode:", integration?.integration_mode, "error:", integrationError?.message)

    if (!integration) {
      return NextResponse.json(
        { error: `Nessuna integrazione PMS configurata per questo hotel. Vai su Impostazioni > Configura PMS per configurarla.` },
        { status: 404 },
      )
    }

    const integrationMode = integration.integration_mode || "api" // default api per retrocompatibilita

    // ========================================================
    // MODALITA' GSHEETS: legge dati dal Google Sheet configurato
    // ========================================================
    if (integrationMode === "gsheets") {
      console.log("[v0] GSheets mode for hotel:", hotelId, "spreadsheetId:", integration.gsheet_spreadsheet_id)

      // Carica le mappature esistenti per questo hotel dal DB
      const { data: existingMappings } = await adminSupabase
        .from("pms_rms_mappings")
        .select("pms_entity_type, pms_code, pms_label, rms_code")
        .eq("hotel_id", hotelId)

      // Costruisci values hotel-specific dalle mappature esistenti + valori statici del provider
      const hotelValues: Record<string, Array<{ code: string; label: string }>> = {}

      // Raggruppa mappature esistenti per entity type
      if (existingMappings && existingMappings.length > 0) {
        for (const m of existingMappings) {
          if (!hotelValues[m.pms_entity_type]) hotelValues[m.pms_entity_type] = []
          if (!hotelValues[m.pms_entity_type].find((v) => v.code === m.pms_code)) {
            hotelValues[m.pms_entity_type].push({
              code: m.pms_code,
              label: m.pms_label || m.pms_code,
            })
          }
        }
      }

      // ========================================================
      // LETTURA AUTOMATICA DAL GOOGLE SHEET
      // Estrae room_type, channel, rate_plan dai dati del foglio
      // ========================================================
      if (integration.gsheet_spreadsheet_id) {
        const apiKey = process.env.GOOGLE_SHEETS_API_KEY
        if (apiKey) {
          const baseUrl = "https://sheets.googleapis.com/v4/spreadsheets"
          const spreadsheetId = integration.gsheet_spreadsheet_id

          try {
            // Tab da leggere per estrarre i codici
            const tabsToRead = [
              { tab: "Disponibilita", codeColumn: "codice_camera", entityType: "room_type" },
              { tab: "Prenotazioni", codeColumn: "codice_camera", entityType: "room_type" },
              { tab: "Prenotazioni", codeColumn: "canale", entityType: "channel" },
              { tab: "Tariffe", codeColumn: "codice_camera", entityType: "room_type" },
              { tab: "Tariffe", codeColumn: "nome_tariffa", entityType: "rate_plan" },
            ]

            for (const { tab, codeColumn, entityType } of tabsToRead) {
              try {
                const encodedRange = encodeURIComponent(`'${tab}'!A1:ZZ500`)
                const url = `${baseUrl}/${spreadsheetId}/values/${encodedRange}?key=${apiKey}&valueRenderOption=FORMATTED_VALUE`
                const res = await fetch(url, { headers: { Accept: "application/json" } })
                
                if (res.ok) {
                  const data = await res.json()
                  const rows: string[][] = data.values || []
                  
                  if (rows.length > 1) {
                    // Trova l'indice della colonna richiesta
                    const headers = rows[0].map((h: string) => 
                      String(h).toLowerCase().trim().replace(/\s+/g, "_")
                    )
                    
                    // Log headers per debug - aiuta a capire quali colonne esistono
                    console.log(`[v0] GSheet "${tab}" headers:`, headers.join(", "))
                    
                    const colIndex = headers.indexOf(codeColumn)
                    
                    if (colIndex >= 0) {
                      // Estrai valori unici dalla colonna
                      const uniqueCodes = new Set<string>()
                      for (let i = 1; i < rows.length; i++) {
                        const cellValue = rows[i]?.[colIndex]
                        if (cellValue && String(cellValue).trim()) {
                          uniqueCodes.add(String(cellValue).trim())
                        }
                      }
                      
                      // Aggiungi a hotelValues se non gia' presenti
                      if (!hotelValues[entityType]) hotelValues[entityType] = []
                      for (const code of uniqueCodes) {
                        if (!hotelValues[entityType].find((v) => v.code === code)) {
                          hotelValues[entityType].push({ code, label: code })
                        }
                      }
                      
                      console.log(`[v0] GSheet "${tab}" -> ${entityType}: found ${uniqueCodes.size} unique codes from column "${codeColumn}"`)
                    } else {
                      console.log(`[v0] GSheet "${tab}": column "${codeColumn}" not found for ${entityType}`)
                    }
                  }
                }
              } catch (tabErr) {
                console.log(`[v0] GSheet tab "${tab}" read error (non-critical):`, tabErr)
                // Non bloccare se un tab non esiste
              }
            }
          } catch (gsheetErr) {
            console.error("[v0] GSheet read error:", gsheetErr)
            // Non bloccare - continua con i valori dalle mappature esistenti
          }
        }
      }

      // Aggiungi valori statici del provider se non gia' presenti
      const staticValues = pmsConfig.values || {}
      for (const [key, vals] of Object.entries(staticValues)) {
        if (!hotelValues[key]) hotelValues[key] = []
        for (const v of vals) {
          if (!hotelValues[key].find((existing) => existing.code === v.code)) {
            hotelValues[key].push(v)
          }
        }
      }

      // Aggiungi fields come values per le sezioni di schema mapping
      Object.entries(pmsConfig.fields).forEach(([key, fields]) => {
        if (!hotelValues[key]) {
          hotelValues[key] = fields.map((f) => ({ code: f.pms_field, label: f.label }))
        }
      })

      // Per GSheets: assicurati che ci siano sempre le entity types hotel-specific
      // anche se vuote, cosi la UI mostrera la possibilita di aggiungere manualmente
      const hotelLevelEntities = ["room_type", "rate_plan", "channel", "payment_method", "meal_plan"]
      for (const entity of hotelLevelEntities) {
        if (!hotelValues[entity]) {
          hotelValues[entity] = []
        }
      }

      console.log("[v0] GSheets hotel values loaded:", Object.keys(hotelValues).map(k => `${k}:${hotelValues[k]?.length}`))

      return NextResponse.json({
        provider,
        scope,
        hotelId,
        integrationMode: "gsheets",
        gsheetSpreadsheetId: integration.gsheet_spreadsheet_id,
        gsheetSpreadsheetUrl: integration.gsheet_spreadsheet_url,
        values: hotelValues,
        fields: pmsConfig.fields,
      })
    }

    // ========================================================
    // MODALITA' API: scarica dati live dall'API del PMS
    // ========================================================
    console.log("[v0] API mode for hotel:", hotelId, "provider:", provider)

    // Cerca credenziali API con fallback chain:
    // 1. pms_integrations (gia' letta sopra)
    // 2. hotel_bindings -> pms_integration_id FK
    // 3. pms_providers (credenziali globali del provider)
    // 4. Environment variables (dev/testing)
    const integrationConfig = integration.config as { api_key?: string; property_id?: string } | null
    let apiKey = integration.api_key || integrationConfig?.api_key
    let propertyId = integration.property_id || integrationConfig?.property_id

    // Fallback: hotel_bindings -> linked pms_integration
    if (!apiKey) {
      const { data: binding } = await adminSupabase
        .from("hotel_bindings")
        .select("pms_integration_id")
        .eq("hotel_id", hotelId)
        .maybeSingle()
      
      if (binding?.pms_integration_id && binding.pms_integration_id !== integration.id) {
        const { data: linked } = await adminSupabase
          .from("pms_integrations")
          .select("api_key, property_id, config")
          .eq("id", binding.pms_integration_id)
          .maybeSingle()
        if (linked) {
          const lc = linked.config as { api_key?: string; property_id?: string } | null
          apiKey = linked.api_key || lc?.api_key
          propertyId = linked.property_id || lc?.property_id
        }
      }
    }

    // Fallback: pms_providers (credenziali globali)
    if (!apiKey) {
      const { data: pmsProvider } = await adminSupabase
        .from("pms_providers")
        .select("api_key, api_extra_config")
        .ilike("code", `%${provider}%`)
        .maybeSingle()
      if (pmsProvider) {
        const ec = pmsProvider.api_extra_config as { property_id?: string } | null
        apiKey = pmsProvider.api_key
        propertyId = propertyId || ec?.property_id
      }
    }

    // Fallback: environment variables
    if (!apiKey) {
      apiKey = process.env.SCIDOO_API_KEY
      propertyId = propertyId || process.env.SCIDOO_PROPERTY_ID
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: `Nessuna credenziale API trovata per ${provider}. Configura l'integrazione PMS con modalita API.` },
        { status: 404 },
      )
    }

    console.log("[v0] API mode credentials - provider:", provider, "apiKey present:", !!apiKey, "propertyId:", propertyId)

    // ========================================================
    // PROVIDER: SLOPE (connettore nativo, Partner API v1)
    // 14/07/2026: PRIMA di questo ramo gli hotel Slope cadevano nel
    // fallback ScidooClient (API sbagliate -> errore). Il ramo sta
    // PRIMA del check propertyId: la API key Slope e' gia' scoped
    // per establishment, non serve property_id.
    // ========================================================
    if (provider === "slope") {
      try {
        const { SlopeClient, SlopeError } = await import("@/lib/connectors/slope/client")
        const { slopeName } = await import("@/lib/connectors/slope/types")
        const slopeBaseUrl =
          integration.endpoint_url || (integrationConfig as { endpoint_url?: string } | null)?.endpoint_url || ""
        const slope = new SlopeClient({ baseUrl: slopeBaseUrl, apiKey })

        const [lodgingTypes, ratePlans] = await Promise.all([slope.getLodgingTypes(), slope.getRatePlans()])

        console.log("[v0] Slope data - lodgingTypes:", lodgingTypes.length, "ratePlans:", ratePlans.length)

        const hotelValues: Record<string, Array<{ code: string; label: string }>> = {
          room_type: lodgingTypes.map((lt) => ({
            code: String(lt.id),
            label: slopeName(lt.name) || `Lodging Type ${lt.id}`,
          })),
          rate_plan: ratePlans.map((rp) => ({
            code: String(rp.id),
            // isDerived segnalato in label: NO push prezzi su piani derivati
            label: `${slopeName(rp.name) || `Rate ${rp.id}`}${rp.isDerived ? " (derivata)" : ""}`,
          })),
        }

        return NextResponse.json({
          provider,
          scope,
          hotelId,
          values: hotelValues,
          fields: pmsConfig.fields,
          rmsCanonicalCodes: {
            room_type: hotelValues.room_type.map((rt) => rt.code),
            rate_plan: hotelValues.rate_plan.map((rp) => rp.code),
            booking_status: ["CONFIRMED", "TENTATIVE", "CANCELLED", "NO_SHOW"],
            channel: [
              "DIRECT",
              "BOOKING_COM",
              "EXPEDIA",
              "AIRBNB",
              "AGODA",
              "HOTELS_COM",
              "OTA_OTHER",
              "GDS",
              "CORPORATE",
              "TRAVEL_AGENT",
              "WHOLESALER",
            ],
          },
        })
      } catch (error) {
        console.error("[v0] Slope fetch error:", error)
        const { SlopeError } = await import("@/lib/connectors/slope/client")
        let status = 500
        let details = error instanceof Error ? error.message : "Unknown error"
        if (error instanceof SlopeError && error.status === 401) {
          status = 401
          details = "Credenziali Slope non valide o scadute (401). Verifica la API key in Binding & Versioni."
        } else if (error instanceof SlopeError && error.status === 403) {
          // 22/07/2026 (caso HOTEL VERDI): il 403 di Slope in produzione NON e'
          // (solo) credenziali sbagliate. Con token valido ma integrazione
          // partner non ancora abilitata (pre-certificazione) Slope risponde
          // 403 "Endpoint not allowed for your integration". Distinguere i due
          // casi evita di far ricontrollare all'utente una API key corretta.
          status = 403
          const notAllowed = error.body.includes("Endpoint not allowed")
          details = notAllowed
            ? "Slope: 'Endpoint not allowed for your integration' — il token e' valido ma l'integrazione partner non e' ancora abilitata su questo endpoint (tipicamente in attesa di certificazione Slope). Non e' un problema di API key."
            : "Accesso negato da Slope (403). Verifica la API key in Binding & Versioni o lo stato dell'integrazione partner presso Slope."
        }
        return NextResponse.json({ error: `Errore nel caricamento dati da Slope`, details }, { status })
      }
    }

    if (!propertyId) {
      return NextResponse.json(
        {
          error:
            `Nessun property_id configurato per questo hotel (${hotelId}). Vai su Binding & Versioni e configura il Property ID.`,
        },
        { status: 404 },
      )
    }

    // ========================================================
    // PROVIDER: BRiG (read-only bridge connector)
    // Endpoint: /api/nol/roomtypes/list, /api/nol/rateplans/list
    // ========================================================
    if (provider === "brig") {
      const baseUrl = integration.endpoint_url || process.env.BRIG_BASE_URL || ""
      if (!baseUrl) {
        return NextResponse.json(
          { error: "Manca endpoint_url per BRiG. Vai su Impostazioni > Configura PMS e inserisci l'URL del bridge." },
          { status: 404 },
        )
      }
      // Pre-validazione api_key: BRiG accetta UUID (~36 char) come x-api-key.
      // Se troviamo una stringa che inizia con "eyJ" e' quasi sempre un JWT
      // incollato per sbaglio (es. token Supabase) e il bridge rispondera' 401
      // con messaggi a volte poco leggibili. Caso 19/05/2026: Hotel Cavallino
      // aveva un JWT da 814 caratteri salvato come api_key BRiG.
      if (typeof apiKey === "string" && apiKey.startsWith("eyJ") && apiKey.length > 100) {
        return NextResponse.json(
          {
            error:
              "API Key BRiG non valida: e' stato salvato un JWT (token), ma BRiG si aspetta una UUID di 36 caratteri tipo 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'. Vai su Impostazioni > Configura PMS e inserisci la chiave corretta fornita dal provider.",
            hint: `api_key length=${apiKey.length}, prefix=${apiKey.slice(0, 8)}...`,
          },
          { status: 400 },
        )
      }
      try {
        const { BrigClient, BrigError } = await import("@/lib/connectors/brig/client")
        const brig = new BrigClient({ baseUrl, apiKey, structureId: propertyId })

        // NB: usiamo allSettled per non perdere il messaggio d'errore originale.
        // Un .catch(() => []) silenzioso aveva mascherato un 403 "API Key non
        // valida" facendo apparire l'hotel come "0 entita" senza ragione.
        const [roomTypesResult, ratePlansResult] = await Promise.allSettled([
          brig.getRoomTypes(),
          brig.getRatePlans(),
        ])

        // Se entrambe falliscono con lo stesso errore di auth/connessione,
        // ritorna 502 con messaggio reale.
        const failures = [roomTypesResult, ratePlansResult].filter(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult[]
        if (failures.length === 2) {
          const err = failures[0].reason
          let detail = err instanceof Error ? err.message : String(err)
          let status = 502
          if (err instanceof BrigError) {
            // Prova a estrarre il messaggio JSON dal body
            try {
              const parsed = JSON.parse(err.body)
              if (parsed?.error) detail = parsed.error
            } catch {
              // body non JSON, lascia detail = err.message
            }
            // Propaga lo status code reale (403 -> 403, 401 -> 401)
            if (err.status === 401 || err.status === 403) status = err.status
          }
          console.error("[v0] BRiG both calls failed:", err)
          return NextResponse.json(
            {
              error: `Errore BRiG: ${detail}`,
              hint:
                err instanceof BrigError && (err.status === 401 || err.status === 403)
                  ? "Verifica la api_key in Configurazione PMS. Il bridge BRiG ha risposto: API Key non valida o disabilitata."
                  : `Bridge URL: ${baseUrl}, propertyId: ${propertyId}`,
            },
            { status },
          )
        }

        const roomTypesRaw = roomTypesResult.status === "fulfilled" ? roomTypesResult.value : []
        const ratePlansRaw = ratePlansResult.status === "fulfilled" ? ratePlansResult.value : []

        // Raccogli warning per failure parziali (es. roomtypes 500 ma rateplans 200)
        // cosi il frontend puo mostrarli in toast/banner invece di sembrare vuoto.
        const warnings: string[] = []
        if (roomTypesResult.status === "rejected") {
          const e = roomTypesResult.reason
          let msg = e instanceof Error ? e.message : String(e)
          if (e instanceof BrigError) {
            try {
              const parsed = JSON.parse(e.body)
              if (parsed?.error) msg = parsed.error
            } catch {}
            msg = `BRiG getRoomTypes ${e.status}: ${msg}`
          }
          console.error("[v0] BRiG getRoomTypes error:", e)
          warnings.push(`Tipologie camera non disponibili (${msg})`)
        }
        if (ratePlansResult.status === "rejected") {
          const e = ratePlansResult.reason
          let msg = e instanceof Error ? e.message : String(e)
          if (e instanceof BrigError) {
            try {
              const parsed = JSON.parse(e.body)
              if (parsed?.error) msg = parsed.error
            } catch {}
            msg = `BRiG getRatePlans ${e.status}: ${msg}`
          }
          console.error("[v0] BRiG getRatePlans error:", e)
          warnings.push(`Piani tariffari non disponibili (${msg})`)
        }

        // BRiG ritorna o array diretto o oggetto wrapper -- normalizziamo
        const normalizeArray = (raw: unknown): any[] => {
          if (Array.isArray(raw)) return raw
          if (raw && typeof raw === "object") {
            const r = raw as Record<string, unknown>
            return (r.results as any[]) || (r.data as any[]) || (r.items as any[]) || []
          }
          return []
        }

        const roomTypes = normalizeArray(roomTypesRaw)
        const ratePlans = normalizeArray(ratePlansRaw)
        console.log("[v0] BRiG roomTypes:", roomTypes.length, "ratePlans:", ratePlans.length)

        // 200 con body vuoto e' tipico quando structureId non corrisponde a
        // nessuna property sul bridge: non e' un errore tecnico, ma per l'utente
        // significa "nessun dato disponibile".
        if (roomTypesResult.status === "fulfilled" && roomTypes.length === 0) {
          warnings.push(
            `BRiG ha risposto OK ma 0 tipologie camera per structureId=${propertyId}. Verifica il property_id in Configurazione PMS.`,
          )
        }
        if (ratePlansResult.status === "fulfilled" && ratePlans.length === 0) {
          warnings.push(
            `BRiG ha risposto OK ma 0 piani tariffari per structureId=${propertyId}.`,
          )
        }

        // Estrai code/name. BRiG room/rate type usa { code, name } (vedi BrigRoomType in lib/connectors/brig/types.ts)
        const hotelValues: Record<string, Array<{ code: string; label: string }>> = {
          room_type: roomTypes
            .map((rt: any) => ({
              code: String(rt.code ?? rt.id ?? rt._id ?? ""),
              label: String(rt.name ?? rt.description ?? rt.code ?? "Unknown"),
            }))
            .filter((v) => v.code),
          rate_plan: ratePlans
            .map((rp: any) => ({
              code: String(rp.code ?? rp.id ?? rp._id ?? ""),
              label: String(rp.name ?? rp.description ?? rp.code ?? "Unknown"),
            }))
            .filter((v) => v.code),
        }

        // Aggiungi i values statici (booking_status, channel) dal config BRiG
        const staticValues = pmsConfig.values || {}
        for (const [key, vals] of Object.entries(staticValues)) {
          if (!hotelValues[key]) hotelValues[key] = []
          for (const v of vals) {
            if (!hotelValues[key].find((existing) => existing.code === v.code)) {
              hotelValues[key].push(v)
            }
          }
        }

        // Aggiungi i fields come values per il pannello schema mapping
        Object.entries(pmsConfig.fields).forEach(([key, fields]) => {
          if (!hotelValues[key]) {
            hotelValues[key] = fields.map((f) => ({ code: f.pms_field, label: f.label }))
          }
        })

        return NextResponse.json({
          provider,
          scope,
          hotelId,
          integrationMode: integration.integration_mode || "api",
          values: hotelValues,
          fields: pmsConfig.fields,
          warnings: warnings.length > 0 ? warnings : undefined,
          rmsCanonicalCodes: {
            room_type: hotelValues.room_type.map((rt) => rt.code),
            rate_plan: hotelValues.rate_plan.map((rp) => rp.code),
            booking_status: ["CONFIRMED", "TENTATIVE", "CANCELLED", "NO_SHOW"],
            channel: [
              "DIRECT",
              "BOOKING_COM",
              "EXPEDIA",
              "AIRBNB",
              "AGODA",
              "HOTELS_COM",
              "OTA_OTHER",
              "GDS",
              "CORPORATE",
              "TRAVEL_AGENT",
              "WHOLESALER",
            ],
          },
        })
      } catch (error) {
        console.error("[v0] BRiG fetch error:", error)
        return NextResponse.json(
          {
            error: `Errore nel caricamento dati da BRiG`,
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        )
      }
    }

    try {
      const scidooClient = new ScidooClient({
        apiKey: apiKey,
        propertyId: propertyId,
      })

      const [roomTypesResponse, ratesResponse] = await Promise.all([
        scidooClient.getRoomTypes(),
        scidooClient.getRates(),
      ])

      console.log("[v0] Raw roomTypesResponse:", JSON.stringify(roomTypesResponse).substring(0, 500))
      console.log("[v0] Raw ratesResponse:", JSON.stringify(ratesResponse).substring(0, 500))

      let roomTypes: any[] = []
      if (Array.isArray(roomTypesResponse)) {
        roomTypes = roomTypesResponse
      } else if (roomTypesResponse && typeof roomTypesResponse === 'object') {
        roomTypes = (roomTypesResponse as any).results || 
                    (roomTypesResponse as any).room_types || 
                    (roomTypesResponse as any).data || 
                    []
      }

      let rates: any[] = []
      if (Array.isArray(ratesResponse)) {
        rates = ratesResponse
      } else if (ratesResponse && typeof ratesResponse === 'object') {
        rates = (ratesResponse as any).results || 
                (ratesResponse as any).rates || 
                (ratesResponse as any).data || 
                []
      }
      
      console.log("[v0] Room types:", roomTypes.length, "Rates:", rates.length)

      const hotelValues: Record<string, Array<{ code: string; label: string }>> = {
        room_type: roomTypes.map((rt: { id: string | number; name: string }) => ({
          code: String(rt.id),
          label: rt.name || `Room Type ${rt.id}`,
        })),
        rate_plan: rates.map(
          (r: { id: string | number; name: string; arrangement?: string }) => ({
            code: String(r.id),
            label: r.name || `Rate ${r.id}`,
          }),
        ),
        arrangement: (() => {
          const arrangements = rates
            .filter((r: any) => r.arrangement)
            .map((r: any) => {
              const arr = r.arrangement
              if (typeof arr === 'string') {
                return { code: arr, label: arr }
              } else if (arr && typeof arr === 'object') {
                return { 
                  code: String(arr.code || arr.id || arr.name || 'unknown'),
                  label: String(arr.description || arr.name || arr.code || 'Unknown')
                }
              }
              return null
            })
            .filter(Boolean)
          
          const unique = new Map()
          arrangements.forEach((a: any) => unique.set(a.code, a))
          return Array.from(unique.values())
        })(),
      }

      return NextResponse.json({
        provider,
        scope,
        hotelId,
        values: hotelValues,
        fields: pmsConfig.fields,
        rmsCanonicalCodes: {
          room_type: hotelValues.room_type.map((rt) => rt.code),
          rate_plan: hotelValues.rate_plan.map((rp) => rp.code),
          arrangement: hotelValues.arrangement?.map((a) => a.code) || [],
          channel: [
            "DIRECT",
            "BOOKING_COM",
            "EXPEDIA",
            "AIRBNB",
            "AGODA",
            "HOTELS_COM",
            "OTA_OTHER",
            "GDS",
            "CORPORATE",
            "TRAVEL_AGENT",
            "WHOLESALER",
          ],
          payment_method: ["CASH", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", "PAYPAL", "OTHER"],
          board_type: ["RO", "BB", "HB", "FB", "AI"],
        },
      })
    } catch (error) {
      console.error("[v0] Error fetching hotel-specific data:", error)
      return NextResponse.json(
        {
          error: `Errore nel caricamento dati da ${provider}`,
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      )
    }
  }
}
