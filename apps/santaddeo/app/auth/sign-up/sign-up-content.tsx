"use client"

import type React from "react"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useState, useEffect } from "react"
import { AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Footer } from "@/components/layout/footer"
import { isValidPhone } from "@/lib/auth/signup-validation"

interface InviteInfo {
  valid: boolean
  email: string
  role: string
  hotel_name: string
  invited_by_name: string
  first_name?: string
  last_name?: string
}

interface AgentInviteInfo {
  valid: boolean
  email: string
  display_name: string | null
  default_commission_percentage: number | null
  invited_by_name: string | null
  expires_at: string
}

export default function SignUpContent() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
        <div className="w-full max-w-md text-center text-muted-foreground">Caricamento...</div>
      </div>
    }>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <SignUpForm />
        </div>
        <Footer />
      </div>
    </Suspense>
  )
}

function SignUpForm() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get("invite") ?? null
  const inviteEmail = searchParams?.get("email") ?? null
  // Sales tracking: ?ref=<token> identifica il venditore che ha invitato
  // questo lead. Il server lo matcha contro sales_leads.tracking_token.
  const salesRefToken = searchParams?.get("ref") ?? null
  // Invito venditore: ?invite_agent=<token> il superadmin ha invitato
  // questo utente come sales_agent (vedi /api/superadmin/sales/agents POST).
  const agentInviteToken = searchParams?.get("invite_agent") ?? null

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [agentInviteInfo, setAgentInviteInfo] = useState<AgentInviteInfo | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken || !!agentInviteToken)

  const [formData, setFormData] = useState({
    email: inviteEmail || "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    phone: "",
    hotelName: "",
    companyName: "",
    vatNumber: "",
    accountType: "hotel" as "hotel" | "consultant",
  })
  const [honeypot, setHoneypot] = useState("")
  // Timestamp di mount del form per anti-bot timing check (cfr. _hp_ts).
  // useState lazy init garantisce che venga settato una sola volta al primo render.
  const [formMountedAt] = useState<number>(() => Date.now())
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!inviteToken) return

    async function validateInvite() {
      try {
        const res = await fetch(`/api/team/invite/validate?token=${inviteToken}`)
        const data = await res.json()

        if (res.ok && data.valid) {
          if (data.userAlreadyExists) {
            router.push(`/auth/login?invite=${inviteToken}&invite_hotel=${encodeURIComponent(data.hotel_name || "")}`)
            return
          }

          setInviteInfo(data)
          setFormData((prev) => ({
            ...prev,
            email: data.email,
            firstName: data.first_name || prev.firstName,
            lastName: data.last_name || prev.lastName,
          }))
        } else {
          setError("Questo invito non e' valido o e' scaduto. Contatta chi ti ha invitato.")
        }
      } catch {
        setError("Errore durante la verifica dell'invito")
      } finally {
        setInviteLoading(false)
      }
    }

    validateInvite()
  }, [inviteToken, router])

  useEffect(() => {
    if (!agentInviteToken || inviteToken) return

    async function validateAgentInvite() {
      try {
        const res = await fetch(`/api/auth/sales-agent-invite/validate?token=${agentInviteToken}`)
        const data = await res.json()
        if (res.ok && data.valid) {
          setAgentInviteInfo(data)
          // Split display_name in firstName/lastName per pre-popolare i campi
          const dn = (data.display_name as string | null)?.trim() || ""
          const parts = dn.split(/\s+/)
          const firstName = parts[0] || ""
          const lastName = parts.slice(1).join(" ") || ""
          setFormData((prev) => ({
            ...prev,
            email: data.email,
            firstName: firstName || prev.firstName,
            lastName: lastName || prev.lastName,
          }))
        } else {
          setError(
            "Questo invito venditore non e' valido o e' scaduto. Contatta l'amministratore SANTADDEO.",
          )
        }
      } catch {
        setError("Errore durante la verifica dell'invito venditore")
      } finally {
        setInviteLoading(false)
      }
    }

    validateAgentInvite()
  }, [agentInviteToken, inviteToken])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Cellulare obbligatorio per i self-signup (struttura + consulente).
    // Per gli invitati il recapito e' gestito dal flusso di invito.
    const isInviteFlow = !!inviteInfo || !!agentInviteInfo
    if (!isInviteFlow) {
      if (!formData.phone.trim()) {
        setError("Inserisci un numero di cellulare")
        return
      }
      if (!isValidPhone(formData.phone)) {
        setError("Numero di cellulare non valido. Usa il formato internazionale, es. +39 333 1234567")
        return
      }
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Le password non corrispondono")
      return
    }

    if (formData.password.length < 8) {
      setError("La password deve essere di almeno 8 caratteri")
      return
    }

    if (!/[a-zA-Z]/.test(formData.password) || !/\d/.test(formData.password)) {
      setError("La password deve contenere almeno una lettera e un numero")
      return
    }

    setIsPending(true)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          hotelName: inviteInfo || agentInviteInfo ? "" : formData.hotelName,
          companyName: inviteInfo || agentInviteInfo ? "" : formData.companyName,
          vatNumber: inviteInfo || agentInviteInfo ? "" : formData.vatNumber,
          // Per gli utenti invitati (team o sales agent) non mandiamo
          // accountType: il server lo determina dal record di invito.
          accountType: inviteInfo || agentInviteInfo ? undefined : formData.accountType,
          inviteToken: inviteToken || undefined,
          salesRefToken: salesRefToken || undefined,
          agentInviteToken: agentInviteToken || undefined,
          _hp_field: honeypot,
          _hp_ts: formMountedAt,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Errore durante la registrazione")
        setIsPending(false)
        return
      }

      if (inviteToken) {
        try {
          await fetch("/api/team/invite/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: inviteToken }),
          })
        } catch {
          // Non-critical
        }
      }

      if (data.isExistingUser) {
        router.push("/auth/login?invite_accepted=1")
        return
      }

      if (data.isInvitedUser) {
        router.push("/auth/login?verified=1")
        return
      }

      // Sales agent invitation: account creato come email_confirm=true,
      // niente verifica email separata. Manda l'utente al login.
      if (agentInviteToken) {
        router.push("/auth/login?agent_invite_accepted=1")
        return
      }

      const emailParam = encodeURIComponent(formData.email)
      if (data.emailSent === false && data.verifyLink) {
        router.push(`/auth/verify-email?email=${emailParam}&fallbackLink=${encodeURIComponent(data.verifyLink)}`)
      } else {
        router.push(`/auth/verify-email?email=${emailParam}`)
      }
    } catch (err) {
      setError("Errore di connessione al server")
      setIsPending(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={120} height={36} className="mx-auto" />
          </Link>
          <p className="mt-2 text-muted-foreground">Inizia il tuo percorso di Revenue Management</p>
        </div>

        {inviteLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Verifica invito in corso...
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {inviteInfo || agentInviteInfo ? "Completa la registrazione" : "Registrazione"}
              </CardTitle>
              <CardDescription>
                {inviteInfo
                  ? `Sei stato invitato da ${inviteInfo.invited_by_name} a unirti a ${inviteInfo.hotel_name}`
                  : agentInviteInfo
                  ? `Sei stato invitato${agentInviteInfo.invited_by_name ? ` da ${agentInviteInfo.invited_by_name}` : ""} come venditore SANTADDEO`
                  : "Crea il tuo account per iniziare"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inviteInfo && (
                <Alert className="mb-4 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Invito valido per <strong>{inviteInfo.hotel_name}</strong> come{" "}
                    <strong>
                      {inviteInfo.role === "property_admin"
                        ? "Amministratore"
                        : inviteInfo.role === "consultant"
                        ? "Consulente"
                        : "Utente"}
                    </strong>.
                  </AlertDescription>
                </Alert>
              )}
              {agentInviteInfo && (
                <Alert className="mb-4 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Invito valido come <strong>venditore SANTADDEO</strong>
                    {agentInviteInfo.default_commission_percentage != null && agentInviteInfo.default_commission_percentage > 0 ? (
                      <>
                        {" · "}
                        <strong>
                          Commissione: {agentInviteInfo.default_commission_percentage}%
                        </strong>
                      </>
                    ) : null}
                    .
                  </AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSignUp}>
                <div className="absolute opacity-0 -z-10 h-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
                  <label htmlFor="_hp_website">Website</label>
                  <input
                    id="_hp_website"
                    name="_hp_website"
                    type="text"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-4">
                  {!inviteInfo && !agentInviteInfo && (
                    <div className="grid gap-2">
                      <Label htmlFor="accountType">Tipo di Account</Label>
                      <Select
                        value={formData.accountType}
                        onValueChange={(value: "hotel" | "consultant") => setFormData({ ...formData, accountType: value })}
                        disabled={isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hotel">Struttura Ricettiva</SelectItem>
                          <SelectItem value="consultant">Consulente / Partner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">Nome</Label>
                      <Input
                        id="firstName"
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        disabled={isPending}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Cognome</Label>
                      <Input
                        id="lastName"
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="phone">Cellulare{!inviteInfo && !agentInviteInfo ? " *" : ""}</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required={!inviteInfo && !agentInviteInfo}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={isPending}
                      placeholder="+39 333 1234567"
                    />
                    <p className="text-xs text-muted-foreground">
                      Formato internazionale con prefisso, es. +39 333 1234567
                    </p>
                  </div>

                  {!inviteInfo && !agentInviteInfo && (
                  <>
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-3">
                      {formData.accountType === "hotel" ? "Dati Azienda" : "Dati Professionali"}
                    </h3>
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="companyName">Ragione Sociale *</Label>
                        <Input
                          id="companyName"
                          type="text"
                          required
                          value={formData.companyName}
                          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                          disabled={isPending}
                          placeholder={formData.accountType === "hotel" ? "Es: Hotel Belvedere S.r.l." : "Es: Studio Consulenza Revenue SRL"}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="vatNumber">Partita IVA *</Label>
                        <Input
                          id="vatNumber"
                          type="text"
                          required
                          value={formData.vatNumber}
                          onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                          disabled={isPending}
                          placeholder="IT12345678901"
                        />
                      </div>
                    </div>
                  </div>

                  {formData.accountType === "hotel" && (
                    <div className="grid gap-2">
                      <Label htmlFor="hotelName">Nome Struttura *</Label>
                      <Input
                        id="hotelName"
                        type="text"
                        required
                        value={formData.hotelName}
                        onChange={(e) => setFormData({ ...formData, hotelName: e.target.value })}
                        disabled={isPending}
                        placeholder="Hotel Belvedere"
                      />
                      <p className="text-xs text-muted-foreground">Una ragione sociale puo gestire piu strutture</p>
                    </div>
                  )}
                  </>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="nome@hotel.com"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isPending || !!inviteInfo || !!agentInviteInfo}
                      readOnly={!!inviteInfo || !!agentInviteInfo}
                      className={inviteInfo || agentInviteInfo ? "bg-muted" : ""}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        disabled={isPending}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isPending}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Conferma Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        disabled={isPending}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isPending}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "Registrazione in corso..." : "Registrati"}
                  </Button>
                </div>
              </form>
              <div className="mt-6 text-center text-sm">
                Hai gia un account?{" "}
                <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700 underline">
                  Accedi
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
