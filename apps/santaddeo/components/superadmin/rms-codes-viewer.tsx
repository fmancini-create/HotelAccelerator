"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Database, FileJson, Users, Calendar, CreditCard, Home, Tag, Utensils, FileText } from "lucide-react"

// Codici RMS canonici - Schema fields per entity type
const RMS_SCHEMA_FIELDS: Record<string, Array<{ code: string; label: string; description?: string }>> = {
  reservation: [
    { code: "booking_id", label: "ID Prenotazione", description: "Identificativo univoco della prenotazione" },
    { code: "check_in_date", label: "Data Check-in", description: "Data di arrivo" },
    { code: "check_out_date", label: "Data Check-out", description: "Data di partenza" },
    { code: "created_at", label: "Data Creazione", description: "Data e ora di creazione della prenotazione" },
    { code: "cancelled_at", label: "Data Cancellazione", description: "Data e ora di cancellazione (se cancellata)" },
    { code: "status", label: "Stato", description: "Stato corrente della prenotazione" },
    { code: "room_type_id", label: "ID Tipologia Camera", description: "Riferimento alla tipologia camera" },
    { code: "rate_id", label: "ID Tariffa", description: "Riferimento alla tariffa applicata" },
    { code: "guests_count", label: "Numero Ospiti", description: "Totale ospiti" },
    { code: "adults", label: "Adulti", description: "Numero adulti" },
    { code: "children", label: "Bambini", description: "Numero bambini" },
    { code: "daily_rates", label: "Prezzi Giornalieri", description: "Array di prezzi per ogni notte" },
    { code: "extras", label: "Extra", description: "Servizi extra prenotati" },
    { code: "total_amount", label: "Importo Totale", description: "Importo totale della prenotazione" },
    { code: "notes", label: "Note", description: "Note interne sulla prenotazione" },
    { code: "channel", label: "Canale", description: "Canale di provenienza (OTA, Diretto, etc.)" },
    { code: "source", label: "Origine", description: "Origine della prenotazione" },
  ],
  guest: [
    { code: "guest_id", label: "ID Ospite", description: "Identificativo univoco dell'ospite" },
    { code: "first_name", label: "Nome", description: "Nome dell'ospite" },
    { code: "last_name", label: "Cognome", description: "Cognome dell'ospite" },
    { code: "email", label: "Email", description: "Indirizzo email" },
    { code: "phone", label: "Telefono", description: "Numero di telefono fisso" },
    { code: "mobile", label: "Cellulare", description: "Numero di cellulare" },
    { code: "birth_date", label: "Data Nascita", description: "Data di nascita" },
    { code: "birth_place", label: "Luogo Nascita", description: "Luogo di nascita" },
    { code: "nationality", label: "Nazionalità", description: "Nazionalità dell'ospite" },
    { code: "country", label: "Paese", description: "Paese di residenza" },
    { code: "document_type", label: "Tipo Documento", description: "Tipo di documento di identità" },
    { code: "document_number", label: "Numero Documento", description: "Numero del documento" },
    { code: "document_expiry", label: "Scadenza Documento", description: "Data di scadenza del documento" },
    { code: "address", label: "Indirizzo", description: "Indirizzo di residenza" },
    { code: "city", label: "Città", description: "Città di residenza" },
    { code: "zip_code", label: "CAP", description: "Codice postale" },
    { code: "gender", label: "Sesso", description: "Genere dell'ospite" },
  ],
  customer: [
    { code: "customer_id", label: "ID Cliente", description: "Identificativo univoco del cliente" },
    { code: "company_name", label: "Ragione Sociale", description: "Nome dell'azienda" },
    { code: "vat_number", label: "Partita IVA", description: "Partita IVA" },
    { code: "fiscal_code", label: "Codice Fiscale", description: "Codice fiscale" },
    { code: "sdi_code", label: "Codice SDI", description: "Codice destinatario fatturazione elettronica" },
    { code: "pec", label: "PEC", description: "Posta elettronica certificata" },
    { code: "billing_address", label: "Indirizzo Fatturazione", description: "Indirizzo per la fatturazione" },
    { code: "billing_city", label: "Città Fatturazione", description: "Città per la fatturazione" },
    { code: "billing_zip", label: "CAP Fatturazione", description: "CAP per la fatturazione" },
    { code: "billing_country", label: "Paese Fatturazione", description: "Paese per la fatturazione" },
    { code: "contact_email", label: "Email Contatto", description: "Email di contatto principale" },
    { code: "contact_phone", label: "Telefono Contatto", description: "Telefono di contatto principale" },
  ],
  booking_room: [
    { code: "booking_room_id", label: "ID Camera Prenotata", description: "Identificativo della camera prenotata" },
    { code: "booking_id", label: "ID Prenotazione", description: "Riferimento alla prenotazione" },
    { code: "room_id", label: "ID Camera", description: "Riferimento alla camera fisica" },
    { code: "room_type_id", label: "ID Tipologia Camera", description: "Riferimento alla tipologia" },
    { code: "room_number", label: "Numero Camera", description: "Numero della camera" },
    { code: "check_in", label: "Check-in", description: "Data/ora check-in effettivo" },
    { code: "check_out", label: "Check-out", description: "Data/ora check-out effettivo" },
    { code: "adults", label: "Adulti", description: "Numero adulti in questa camera" },
    { code: "children", label: "Bambini", description: "Numero bambini in questa camera" },
    { code: "daily_rate", label: "Tariffa Giornaliera", description: "Prezzo per notte" },
    { code: "total_amount", label: "Importo Totale", description: "Importo totale per questa camera" },
    { code: "rate_id", label: "ID Tariffa", description: "Riferimento alla tariffa" },
    { code: "meal_plan_id", label: "ID Trattamento", description: "Riferimento al trattamento pasti" },
  ],
  tax_document: [
    { code: "document_id", label: "ID Documento", description: "Identificativo del documento fiscale" },
    { code: "document_number", label: "Numero Documento", description: "Numero progressivo del documento" },
    { code: "document_type", label: "Tipo Documento", description: "Tipo (fattura, ricevuta, nota credito)" },
    { code: "document_date", label: "Data Documento", description: "Data di emissione" },
    { code: "total_amount", label: "Importo Totale", description: "Importo totale comprensivo di IVA" },
    { code: "net_amount", label: "Imponibile", description: "Importo al netto di IVA" },
    { code: "vat_amount", label: "IVA", description: "Importo IVA" },
    { code: "customer_id", label: "ID Cliente", description: "Riferimento al cliente" },
    { code: "booking_id", label: "ID Prenotazione", description: "Riferimento alla prenotazione" },
    { code: "payment_method", label: "Metodo Pagamento", description: "Metodo di pagamento utilizzato" },
    { code: "is_paid", label: "Pagato", description: "Stato del pagamento" },
  ],
  room_type: [
    { code: "room_type_id", label: "ID Tipologia", description: "Identificativo della tipologia camera" },
    { code: "room_type_code", label: "Codice Tipologia", description: "Codice breve della tipologia" },
    { code: "room_type_name", label: "Nome Tipologia", description: "Nome completo della tipologia" },
    { code: "max_occupancy", label: "Occupazione Massima", description: "Numero massimo di ospiti" },
    { code: "base_occupancy", label: "Occupazione Base", description: "Occupazione standard" },
    { code: "room_count", label: "Numero Camere", description: "Quantità di camere di questa tipologia" },
    { code: "description", label: "Descrizione", description: "Descrizione della tipologia" },
    { code: "amenities", label: "Servizi", description: "Servizi inclusi nella camera" },
  ],
  rate_plan: [
    { code: "rate_id", label: "ID Tariffa", description: "Identificativo della tariffa" },
    { code: "rate_code", label: "Codice Tariffa", description: "Codice breve della tariffa" },
    { code: "rate_name", label: "Nome Tariffa", description: "Nome completo della tariffa" },
    { code: "room_type_id", label: "ID Tipologia", description: "Tipologia camera associata" },
    { code: "date", label: "Data", description: "Data di validità" },
    { code: "price", label: "Prezzo", description: "Prezzo per notte" },
    { code: "min_stay", label: "Soggiorno Minimo", description: "Numero minimo di notti" },
    { code: "max_stay", label: "Soggiorno Massimo", description: "Numero massimo di notti" },
    { code: "closed", label: "Chiuso", description: "Tariffa non disponibile" },
    { code: "meal_plan", label: "Trattamento", description: "Trattamento pasti incluso" },
  ],
  channel: [
    { code: "channel_id", label: "ID Canale", description: "Identificativo del canale" },
    { code: "channel_code", label: "Codice Canale", description: "Codice breve del canale" },
    { code: "channel_name", label: "Nome Canale", description: "Nome completo del canale" },
    { code: "channel_type", label: "Tipo Canale", description: "Tipo (OTA, GDS, Diretto, etc.)" },
    { code: "commission", label: "Commissione", description: "Percentuale di commissione" },
    { code: "is_active", label: "Attivo", description: "Stato di attivazione del canale" },
  ],
  availability: [
    { code: "date", label: "Data", description: "Data di riferimento" },
    { code: "room_type_id", label: "ID Tipologia", description: "Tipologia camera" },
    { code: "available", label: "Disponibili", description: "Camere disponibili" },
    { code: "sold", label: "Vendute", description: "Camere vendute" },
    { code: "blocked", label: "Bloccate", description: "Camere bloccate" },
    { code: "total", label: "Totale", description: "Totale camere" },
    { code: "overbooking", label: "Overbooking", description: "Camere in overbooking" },
  ],
  booking_status: [
    { code: "CONFIRMED", label: "Confermata", description: "Prenotazione confermata" },
    { code: "PENDING", label: "In Attesa", description: "Prenotazione in attesa di conferma" },
    { code: "CANCELLED", label: "Cancellata", description: "Prenotazione cancellata" },
    { code: "CHECKED_IN", label: "Check-in Effettuato", description: "Ospite arrivato" },
    { code: "CHECKED_OUT", label: "Check-out Effettuato", description: "Ospite partito" },
    { code: "NO_SHOW", label: "No Show", description: "Ospite non presentato" },
    { code: "WAITLIST", label: "Lista d'Attesa", description: "In lista d'attesa" },
    { code: "OPTION", label: "Opzione", description: "Prenotazione opzionale" },
  ],
  payment_method: [
    { code: "CASH", label: "Contanti", description: "Pagamento in contanti" },
    { code: "CREDIT_CARD", label: "Carta di Credito", description: "Pagamento con carta di credito" },
    { code: "BANK_TRANSFER", label: "Bonifico Bancario", description: "Pagamento tramite bonifico" },
    { code: "DEBIT_CARD", label: "Carta di Debito", description: "Pagamento con bancomat" },
    { code: "PAYPAL", label: "PayPal", description: "Pagamento via PayPal" },
    { code: "VOUCHER", label: "Voucher", description: "Pagamento con voucher" },
    { code: "VIRTUAL_CC", label: "Carta Virtuale", description: "Carta di credito virtuale OTA" },
  ],
  meal_plan: [
    { code: "RO", label: "Solo Pernottamento", description: "Room Only - senza pasti" },
    { code: "BB", label: "Bed & Breakfast", description: "Pernottamento e colazione" },
    { code: "HB", label: "Mezza Pensione", description: "Pernottamento, colazione e cena" },
    { code: "FB", label: "Pensione Completa", description: "Pernottamento e tutti i pasti" },
    { code: "AI", label: "All Inclusive", description: "Tutto incluso" },
  ],
  document_type: [
    { code: "PASSPORT", label: "Passaporto", description: "Documento di identità internazionale" },
    { code: "ID_CARD", label: "Carta d'Identità", description: "Carta d'identità nazionale" },
    { code: "DRIVING_LICENSE", label: "Patente", description: "Patente di guida" },
    { code: "RESIDENCE_PERMIT", label: "Permesso Soggiorno", description: "Permesso di soggiorno" },
  ],
}

// Metadata per le categorie
const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  reservation: { label: "Prenotazioni", icon: Calendar, color: "bg-blue-500" },
  guest: { label: "Ospiti", icon: Users, color: "bg-green-500" },
  customer: { label: "Clienti", icon: Users, color: "bg-purple-500" },
  booking_room: { label: "Camere Prenotazione", icon: Home, color: "bg-orange-500" },
  tax_document: { label: "Documenti Fiscali", icon: FileText, color: "bg-red-500" },
  room_type: { label: "Tipologie Camera", icon: Home, color: "bg-cyan-500" },
  rate_plan: { label: "Piani Tariffari", icon: Tag, color: "bg-yellow-500" },
  channel: { label: "Canali", icon: Database, color: "bg-indigo-500" },
  availability: { label: "Disponibilità", icon: Calendar, color: "bg-teal-500" },
  booking_status: { label: "Stati Prenotazione", icon: FileJson, color: "bg-pink-500" },
  payment_method: { label: "Metodi Pagamento", icon: CreditCard, color: "bg-emerald-500" },
  meal_plan: { label: "Trattamenti Pasti", icon: Utensils, color: "bg-amber-500" },
  document_type: { label: "Tipi Documento", icon: FileText, color: "bg-slate-500" },
}

export function RmsCodesViewer() {
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("reservation")

  // Calcola totale codici
  const totalCodes = useMemo(() => {
    return Object.values(RMS_SCHEMA_FIELDS).reduce((acc, codes) => acc + codes.length, 0)
  }, [])

  // Filtra codici per ricerca
  const filteredCodes = useMemo(() => {
    if (!searchTerm) return RMS_SCHEMA_FIELDS[activeTab] || []
    const term = searchTerm.toLowerCase()
    return (RMS_SCHEMA_FIELDS[activeTab] || []).filter(
      (code) =>
        code.code.toLowerCase().includes(term) ||
        code.label.toLowerCase().includes(term) ||
        code.description?.toLowerCase().includes(term),
    )
  }, [activeTab, searchTerm])

  // Ricerca globale
  const globalSearchResults = useMemo(() => {
    if (!searchTerm) return null
    const term = searchTerm.toLowerCase()
    const results: Array<{ category: string; code: string; label: string; description?: string }> = []

    Object.entries(RMS_SCHEMA_FIELDS).forEach(([category, codes]) => {
      codes.forEach((code) => {
        if (
          code.code.toLowerCase().includes(term) ||
          code.label.toLowerCase().includes(term) ||
          code.description?.toLowerCase().includes(term)
        ) {
          results.push({ category, ...code })
        }
      })
    })

    return results.length > 0 ? results : null
  }, [searchTerm])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Codici RMS Canonici</h1>
          <p className="text-muted-foreground">
            Dizionario dei {totalCodes} codici RMS standard utilizzati per la normalizzazione dei dati PMS
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca codice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totale Codici</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCodes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categorie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(RMS_SCHEMA_FIELDS).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Schema API</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">reservation, guest, customer, booking_room, tax_document</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valori Canonici</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">booking_status, payment_method, meal_plan, etc.</p>
          </CardContent>
        </Card>
      </div>

      {/* Risultati ricerca globale */}
      {searchTerm && globalSearchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Risultati ricerca: "{searchTerm}"</CardTitle>
            <CardDescription>{globalSearchResults.length} codici trovati</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Categoria</TableHead>
                  <TableHead className="w-48">Codice</TableHead>
                  <TableHead className="w-48">Label</TableHead>
                  <TableHead>Descrizione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {globalSearchResults.map((result, idx) => {
                  const meta = CATEGORY_META[result.category]
                  return (
                    <TableRow key={`${result.category}-${result.code}-${idx}`}>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {meta?.icon && <meta.icon className="h-3 w-3" />}
                          {meta?.label || result.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">{result.code}</code>
                      </TableCell>
                      <TableCell className="font-medium">{result.label}</TableCell>
                      <TableCell className="text-muted-foreground">{result.description}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabs per categoria */}
      {!searchTerm && (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <TabsTrigger key={key} value={key} className="gap-1.5">
                    <meta.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{meta.label}</span>
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {RMS_SCHEMA_FIELDS[key]?.length || 0}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(RMS_SCHEMA_FIELDS).map(([category, codes]) => (
                <TabsContent key={category} value={category}>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead className="w-56">Codice RMS</TableHead>
                          <TableHead className="w-56">Label</TableHead>
                          <TableHead>Descrizione</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCodes.map((code, idx) => (
                          <TableRow key={code.code}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                                {code.code}
                              </code>
                            </TableCell>
                            <TableCell className="font-medium">{code.label}</TableCell>
                            <TableCell className="text-muted-foreground">{code.description}</TableCell>
                          </TableRow>
                        ))}
                        {filteredCodes.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              Nessun codice trovato
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Note Architetturali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Schema API (5 entità):</strong> reservation, guest, customer, booking_room, tax_document - Questi
            codici rappresentano i campi dello schema dati normalizzato RMS.
          </p>
          <p>
            <strong>Valori Canonici (8 categorie):</strong> booking_status, payment_method, meal_plan, document_type,
            room_type, rate_plan, channel, availability - Questi sono valori standard che vengono mappati dai valori PMS
            specifici.
          </p>
          <p>
            <strong>Immutabilità:</strong> I codici RMS sono canonici e non devono essere modificati una volta che
            esistono mappature attive che li utilizzano.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
