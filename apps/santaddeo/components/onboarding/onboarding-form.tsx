"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertCircle,
  Building2,
  MapPin,
  Bed,
  Key,
  Home,
  Phone,
  Globe,
  Mail,
  Star,
  CheckCircle2,
} from "lucide-react"
import { PMS_CONFIGS } from "@/lib/types/pms"
import type { PMSName } from "@/lib/types/database"
import { completeOnboarding } from "@/app/actions/onboarding"
import { ACCOMMODATION_TYPES, getAccommodationLabel } from "@/lib/utils/accommodation-labels"
import { validateItalianVat } from "@/lib/utils/vat-validator"
import {
  HOTEL_TYPES,
  HOTEL_STARS_OPTIONS,
  hotelTypeSupportsStars,
  ITALIAN_REGIONS,
  getRegionByProvinceCode,
} from "@/lib/utils/hotel-categorization"

interface OnboardingFormProps {
  user: any
  profile: any
}

/**
 * ✅ Never render raw Error/objects in JSX.
 * Converts anything into a safe, user-friendly string.
 */
function toErrorMessage(err: unknown): string {
  if (!err) return "Errore sconosciuto"
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message || "Errore"
  if (typeof err === "object") {
    const anyErr = err as any
    if (typeof anyErr.message === "string") return anyErr.message
    if (typeof anyErr.error === "string") return anyErr.error
    if (typeof anyErr.details === "string") return anyErr.details
    try {
      return JSON.stringify(err)
    } catch {
      return "Errore"
    }
  }
  return String(err)
}

/** Normalizza il sito web prepedendo https:// se l'utente non lo include */
function normalizeWebsite(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Regex permissiva per email pubblica struttura */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Onboarding form (12/05/2026 rewrite):
 *   - Aggiunti campi: telefono, sito web, email contatto, tipologia struttura,
 *     stelle (condizionale), provincia/regione.
 *   - Aggiunta validazione P.IVA italiana (struttura + Luhn) con feedback inline.
 *   - Rimosso il pulsante "Salta" - l'utente deve completare la configurazione.
 *   - Backward-compat: se l'hotel esiste gia' (utente torna dopo verifica email)
 *     pre-popoliamo TUTTI i nuovi campi se gia' salvati.
 */
export function OnboardingForm({ user, profile }: OnboardingFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [existingHotel, setExistingHotel] = useState<any>(null)
  const [existingPms, setExistingPms] = useState<any>(null)

  const [companyData, setCompanyData] = useState({
    companyName: user.user_metadata?.company_name || "",
    vatNumber: user.user_metadata?.vat_number || "",
  })

  const [hotelData, setHotelData] = useState({
    name: user.user_metadata?.hotel_name || "",
    totalRooms: "",
    accommodationType: "camere",
    address: "",
    city: "",
    province: "",
    region: "",
    country: "Italia",
    phone: "",
    website: "",
    contactEmail: "",
    hotelType: "",
    stars: "" as string, // teniamo string nello state per il Select; convertiamo in number nel submit
    timezone: "Europe/Rome",
    currency: "EUR",
  })

  const [pmsData, setPmsData] = useState({
    pmsName: "" as PMSName | "other" | "",
    customPmsName: "",
    scidooApiKey: "",
  })

  // Validazione P.IVA live (mostra check verde / errore rosso)
  const vatValidation = useMemo(() => {
    if (!companyData.vatNumber.trim()) return null
    return validateItalianVat(companyData.vatNumber)
  }, [companyData.vatNumber])

  // Validazione website / email contatto live
  const websiteValid = useMemo(() => {
    if (!hotelData.website.trim()) return null
    const normalized = normalizeWebsite(hotelData.website)
    try {
      new URL(normalized)
      return true
    } catch {
      return false
    }
  }, [hotelData.website])

  const contactEmailValid = useMemo(() => {
    if (!hotelData.contactEmail.trim()) return null
    return EMAIL_REGEX.test(hotelData.contactEmail.trim())
  }, [hotelData.contactEmail])

  // Auto-derive regione quando l'utente seleziona la provincia
  useEffect(() => {
    if (hotelData.province) {
      const region = getRegionByProvinceCode(hotelData.province)
      if (region && region !== hotelData.region) {
        setHotelData((prev) => ({ ...prev, region }))
      }
    }
  }, [hotelData.province, hotelData.region])

  // Stelle nascoste/forzate a "" per tipologie senza classificazione (B&B, etc.)
  const starsApplicable = useMemo(
    () => hotelTypeSupportsStars(hotelData.hotelType),
    [hotelData.hotelType],
  )
  useEffect(() => {
    if (!starsApplicable && hotelData.stars) {
      setHotelData((prev) => ({ ...prev, stars: "" }))
    }
  }, [starsApplicable, hotelData.stars])

  useEffect(() => {
    const loadExistingData = async () => {
      if (!profile?.organization_id) return

      const supabase = createClient()

      const { data: hotels } = await supabase
        .from("hotels")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .limit(1)

      if (hotels && hotels.length > 0) {
        const hotel = hotels[0]
        setExistingHotel(hotel)
        setHotelData({
          name: hotel.name || "",
          totalRooms: hotel.total_rooms?.toString() || "",
          accommodationType: hotel.accommodation_type || "camere",
          address: hotel.address || "",
          city: hotel.city || "",
          province: hotel.province || "",
          region: hotel.region || "",
          country: hotel.country || "Italia",
          phone: hotel.phone || "",
          website: hotel.website || "",
          contactEmail: hotel.contact_email || "",
          hotelType: hotel.hotel_type || "",
          stars: hotel.stars?.toString() || "",
          timezone: hotel.timezone || "Europe/Rome",
          currency: hotel.currency || "EUR",
        })

        const { data: pmsIntegrations } = await supabase
          .from("pms_integrations")
          .select("*")
          .eq("hotel_id", hotel.id)
          .limit(1)

        if (pmsIntegrations && pmsIntegrations.length > 0) {
          const pms = pmsIntegrations[0]
          setExistingPms(pms)
          setPmsData({
            pmsName: pms.pms_name,
            customPmsName: pms.config?.custom_name || "",
            scidooApiKey: pms.config?.scidoo_api_key || pms.config?.api_key || "",
          })
        }
      }
    }

    loadExistingData()
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    // 1) Validazione campi obbligatori base
    if (!companyData.companyName.trim() || !companyData.vatNumber.trim()) {
      setErrorMessage("Inserisci la ragione sociale e la partita IVA")
      setIsLoading(false)
      return
    }

    // 2) Validazione P.IVA strutturale
    const vat = validateItalianVat(companyData.vatNumber)
    if (!vat.valid) {
      setErrorMessage(vat.reason)
      setIsLoading(false)
      return
    }

    // 3) Campi struttura obbligatori
    if (
      !hotelData.name.trim() ||
      !hotelData.totalRooms ||
      !hotelData.hotelType ||
      !hotelData.phone.trim() ||
      !hotelData.contactEmail.trim() ||
      !hotelData.address.trim() ||
      !hotelData.city.trim() ||
      !hotelData.province ||
      !pmsData.pmsName
    ) {
      setErrorMessage(
        "Compila tutti i campi obbligatori contrassegnati con * (nome struttura, tipologia, telefono, email contatto, indirizzo, città, provincia, PMS)",
      )
      setIsLoading(false)
      return
    }

    // 4) Stelle obbligatorie solo se la tipologia le richiede
    if (starsApplicable && !hotelData.stars) {
      setErrorMessage("Seleziona la classificazione a stelle per la tipologia scelta")
      setIsLoading(false)
      return
    }

    // 5) Email contatto valida
    if (!EMAIL_REGEX.test(hotelData.contactEmail.trim())) {
      setErrorMessage("L'email di contatto della struttura non è valida")
      setIsLoading(false)
      return
    }

    // 6) Website opzionale ma se compilato deve essere parseable
    if (hotelData.website.trim() && !websiteValid) {
      setErrorMessage("L'URL del sito web non è valido (es. www.miohotel.it)")
      setIsLoading(false)
      return
    }

    try {
      const result = await completeOnboarding({
        companyName: companyData.companyName.trim(),
        vatNumber: vat.normalized,
        organizationName: hotelData.name.trim(),
        hotelName: hotelData.name.trim(),
        totalRooms: Number.parseInt(hotelData.totalRooms, 10),
        accommodationType: hotelData.accommodationType,
        address: hotelData.address.trim(),
        city: hotelData.city.trim(),
        country: hotelData.country.trim() || "Italia",
        phone: hotelData.phone.trim(),
        website: hotelData.website.trim() ? normalizeWebsite(hotelData.website) : undefined,
        contactEmail: hotelData.contactEmail.trim(),
        hotelType: hotelData.hotelType,
        stars: starsApplicable && hotelData.stars ? Number.parseInt(hotelData.stars, 10) : null,
        province: hotelData.province,
        region: hotelData.region,
        pmsName: pmsData.pmsName === "other" ? "other" : pmsData.pmsName,
        pmsOther: pmsData.customPmsName,
        scidooApiKey: pmsData.pmsName === "scidoo" ? pmsData.scidooApiKey : undefined,
      })

      if (!result?.success) {
        throw new Error(toErrorMessage((result as any)?.error) || "Errore durante la configurazione")
      }

      router.push("/dashboard")
      router.refresh()
    } catch (err: unknown) {
      console.error("[v0] Onboarding error:", err)
      setErrorMessage(toErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const isConsultant = user.user_metadata?.account_type === "consultant"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Configura il tuo Account</CardTitle>
        <CardDescription>
          Completa l&apos;anagrafica della struttura per attivare la piattaforma. Tutti i campi contrassegnati con * sono
          obbligatori.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            {/* SEZIONE 1 - Dati azienda */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">
                {isConsultant ? "Dati Professionali" : "Dati Azienda"}
              </h3>

              <div className="grid gap-2">
                <Label htmlFor="companyName">Ragione Sociale *</Label>
                <Input
                  id="companyName"
                  type="text"
                  required
                  value={companyData.companyName}
                  onChange={(e) => setCompanyData({ ...companyData, companyName: e.target.value })}
                  placeholder={
                    isConsultant
                      ? "Es: Studio Consulenza Revenue SRL"
                      : "Es: Hotel Villa I Barronci S.r.l."
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="vatNumber">Partita IVA *</Label>
                <div className="relative">
                  <Input
                    id="vatNumber"
                    type="text"
                    required
                    value={companyData.vatNumber}
                    onChange={(e) => setCompanyData({ ...companyData, vatNumber: e.target.value })}
                    placeholder="IT12345678901"
                    className={
                      vatValidation === null
                        ? ""
                        : vatValidation.valid
                          ? "pr-10 border-emerald-500 focus-visible:ring-emerald-500"
                          : "pr-10 border-destructive focus-visible:ring-destructive"
                    }
                  />
                  {vatValidation?.valid && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                  )}
                  {vatValidation && !vatValidation.valid && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {vatValidation && !vatValidation.valid && (
                  <p className="text-xs text-destructive">{vatValidation.reason}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {isConsultant
                    ? "Come consulente potrai gestire più strutture alberghiere"
                    : "Verifica numerica strutturale. La P.IVA viene normalizzata (rimossi spazi e prefisso IT)."}
                </p>
              </div>
            </div>

            {/* SEZIONE 2 - Informazioni struttura */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">
                {isConsultant ? "Prima Struttura (opzionale)" : "Informazioni Struttura"}
              </h3>

              <div className="grid gap-2">
                <Label htmlFor="hotelName" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Nome Struttura *
                </Label>
                <Input
                  id="hotelName"
                  type="text"
                  required
                  value={hotelData.name}
                  onChange={(e) => setHotelData({ ...hotelData, name: e.target.value })}
                  placeholder="Hotel Villa I Barronci"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="hotelType">Tipologia *</Label>
                  <Select
                    value={hotelData.hotelType}
                    onValueChange={(value) => setHotelData({ ...hotelData, hotelType: value })}
                  >
                    <SelectTrigger id="hotelType">
                      <SelectValue placeholder="Seleziona tipologia" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determina la modalità di classificazione (stelle / extra-alberghiero)
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="stars" className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Classificazione {starsApplicable ? "*" : <span className="text-xs text-muted-foreground">(non applicabile)</span>}
                  </Label>
                  <Select
                    value={hotelData.stars}
                    onValueChange={(value) => setHotelData({ ...hotelData, stars: value })}
                    disabled={!starsApplicable}
                  >
                    <SelectTrigger id="stars">
                      <SelectValue placeholder={starsApplicable ? "Seleziona stelle" : "—"} />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_STARS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value.toString()}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="accommodationType" className="flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Tipo di Sistemazione *
                  </Label>
                  <Select
                    value={hotelData.accommodationType}
                    onValueChange={(value) => setHotelData({ ...hotelData, accommodationType: value })}
                  >
                    <SelectTrigger id="accommodationType">
                      <SelectValue placeholder="Seleziona il tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOMMODATION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Terminologia usata in piattaforma (es. &quot;camere&quot; vs &quot;appartamenti&quot;)
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="totalRooms" className="flex items-center gap-2">
                    <Bed className="h-4 w-4" />
                    Totale {getAccommodationLabel(hotelData.accommodationType)} *
                  </Label>
                  <Input
                    id="totalRooms"
                    type="number"
                    required
                    min="1"
                    value={hotelData.totalRooms}
                    onChange={(e) => setHotelData({ ...hotelData, totalRooms: e.target.value })}
                    placeholder="50"
                  />
                </div>
              </div>
            </div>

            {/* SEZIONE 3 - Contatti pubblici */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Contatti Struttura</h3>
              <p className="text-xs text-muted-foreground -mt-2">
                Contatti pubblici della struttura (separati dai tuoi dati personali di accesso)
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefono Struttura *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    value={hotelData.phone}
                    onChange={(e) => setHotelData({ ...hotelData, phone: e.target.value })}
                    placeholder="+39 055 1234567"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="contactEmail" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Contatto Struttura *
                  </Label>
                  <div className="relative">
                    <Input
                      id="contactEmail"
                      type="email"
                      required
                      value={hotelData.contactEmail}
                      onChange={(e) => setHotelData({ ...hotelData, contactEmail: e.target.value })}
                      placeholder="info@miohotel.it"
                      className={
                        contactEmailValid === null
                          ? ""
                          : contactEmailValid
                            ? "pr-10 border-emerald-500 focus-visible:ring-emerald-500"
                            : "pr-10 border-destructive focus-visible:ring-destructive"
                      }
                    />
                    {contactEmailValid === true && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                    )}
                    {contactEmailValid === false && (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Sito Web
                </Label>
                <div className="relative">
                  <Input
                    id="website"
                    type="url"
                    value={hotelData.website}
                    onChange={(e) => setHotelData({ ...hotelData, website: e.target.value })}
                    placeholder="www.miohotel.it"
                    className={
                      websiteValid === null
                        ? ""
                        : websiteValid
                          ? "pr-10 border-emerald-500 focus-visible:ring-emerald-500"
                          : "pr-10 border-destructive focus-visible:ring-destructive"
                    }
                  />
                  {websiteValid === true && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                  )}
                  {websiteValid === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Opzionale. Se non inserisci il protocollo, aggiungiamo automaticamente https://
                </p>
              </div>
            </div>

            {/* SEZIONE 4 - Indirizzo */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Indirizzo</h3>

              <div className="grid gap-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Indirizzo *
                </Label>
                <Input
                  id="address"
                  type="text"
                  required
                  value={hotelData.address}
                  onChange={(e) => setHotelData({ ...hotelData, address: e.target.value })}
                  placeholder="Via Roma, 123"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">Città *</Label>
                  <Input
                    id="city"
                    type="text"
                    required
                    value={hotelData.city}
                    onChange={(e) => setHotelData({ ...hotelData, city: e.target.value })}
                    placeholder="Firenze"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="province">Provincia *</Label>
                  <Select
                    value={hotelData.province}
                    onValueChange={(value) => setHotelData({ ...hotelData, province: value })}
                  >
                    <SelectTrigger id="province">
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      {ITALIAN_REGIONS.flatMap((r) =>
                        r.provinces.map((p) => (
                          <SelectItem key={p.code} value={p.code}>
                            {p.code} — {p.name}
                          </SelectItem>
                        )),
                      )}
                    </SelectContent>
                  </Select>
                  {hotelData.region && (
                    <p className="text-xs text-muted-foreground">Regione: {hotelData.region}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="country">Paese</Label>
                  <Input
                    id="country"
                    type="text"
                    value={hotelData.country}
                    onChange={(e) => setHotelData({ ...hotelData, country: e.target.value })}
                    placeholder="Italia"
                  />
                </div>
              </div>
            </div>

            {/* SEZIONE 5 - PMS */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Property Management System *</h3>

              <div className="grid gap-2">
                <Label htmlFor="pmsName">Seleziona il tuo PMS</Label>
                <Select
                  required
                  value={pmsData.pmsName}
                  onValueChange={(value: PMSName | "other") => {
                    setPmsData({ ...pmsData, pmsName: value, customPmsName: "", scidooApiKey: "" })
                  }}
                >
                  <SelectTrigger id="pmsName">
                    <SelectValue placeholder="Seleziona il tuo PMS" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PMS_CONFIGS).map((pms) => (
                      <SelectItem key={pms.name} value={pms.name}>
                        {pms.displayName}
                      </SelectItem>
                    ))}
                    <SelectItem value="other">Altro (specifica manualmente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pmsData.pmsName === "scidoo" && (
                <div className="grid gap-2">
                  <Label htmlFor="scidooApiKey" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    API Key Scidoo *
                  </Label>
                  <Input
                    id="scidooApiKey"
                    type="password"
                    required
                    value={pmsData.scidooApiKey}
                    onChange={(e) => setPmsData({ ...pmsData, scidooApiKey: e.target.value })}
                    placeholder="Inserisci la tua API Key di Scidoo"
                  />
                  <p className="text-xs text-muted-foreground">
                    Puoi trovare la tua API Key nel pannello di amministrazione di Scidoo
                  </p>
                </div>
              )}

              {pmsData.pmsName === "other" && (
                <div className="grid gap-2">
                  <Label htmlFor="customPmsName">Nome del tuo PMS *</Label>
                  <Input
                    id="customPmsName"
                    type="text"
                    required
                    value={pmsData.customPmsName}
                    onChange={(e) => setPmsData({ ...pmsData, customPmsName: e.target.value })}
                    placeholder="Es: MyHotelPMS, CustomSystem, ecc."
                  />
                  <p className="text-xs text-muted-foreground">
                    Inserisci il nome del PMS che utilizzi. Ti contatteremo per valutare l&apos;integrazione.
                  </p>
                </div>
              )}

              {pmsData.pmsName && pmsData.pmsName !== "scidoo" && pmsData.pmsName !== "other" && (
                <p className="text-xs text-muted-foreground">
                  Potrai configurare la connessione al PMS dopo la registrazione dalla dashboard
                </p>
              )}
            </div>

            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/*
              12/05/2026: rimosso il pulsante "Salta".
              Motivo: causava casi come "Nunia in Rome" con organization
              creata ma 0 strutture / 0 dati operativi → impossibile usare
              la piattaforma. Ora il completamento e' obbligatorio per
              accedere alla dashboard.
            */}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Configurazione in corso..." : "Completa Registrazione"}
            </Button>

            {existingHotel && (
              <p className="text-xs text-center text-muted-foreground">
                I dati esistenti sono stati pre-caricati. Puoi modificarli prima di salvare.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
