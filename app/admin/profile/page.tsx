"use client"

import { useState } from "react"
import { User, Lock, Save, Eye, EyeOff, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminAuth, getRoleLabel } from "@/lib/admin-hooks"
import { AdminHeader } from "@/components/admin/admin-header"

const PASSWORDS_KEY = "villa_barronci_admin_passwords"

function getStoredPasswords(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(PASSWORDS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function savePassword(email: string, password: string) {
  const passwords = getStoredPasswords()
  passwords[email] = password
  localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords))
}

export default function AdminProfilePage() {
  const { isLoading, adminUser } = useAdminAuth()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8b7355]"></div>
      </div>
    )
  }

  if (!adminUser) {
    return null
  }

  const validatePassword = (password: string): string[] => {
    const errors: string[] = []
    if (password.length < 8) errors.push("Almeno 8 caratteri")
    if (!/[A-Z]/.test(password)) errors.push("Almeno una lettera maiuscola")
    if (!/[a-z]/.test(password)) errors.push("Almeno una lettera minuscola")
    if (!/[0-9]/.test(password)) errors.push("Almeno un numero")
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("Almeno un carattere speciale")
    return errors
  }

  const handleChangePassword = async () => {
    setError("")
    setSuccess("")

    const storedPasswords = getStoredPasswords()
    const currentStoredPassword = storedPasswords[adminUser?.email || ""] || "Admin2024!"

    if (currentPassword !== currentStoredPassword) {
      setError("La password attuale non è corretta")
      return
    }

    // Validate new password
    const passwordErrors = validatePassword(newPassword)
    if (passwordErrors.length > 0) {
      setError(`La nuova password non rispetta i requisiti: ${passwordErrors.join(", ")}`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Le nuove password non coincidono")
      return
    }

    setIsSaving(true)

    try {
      savePassword(adminUser?.email || "", newPassword)

      setSuccess("Password modificata con successo!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      console.error("Password update error:", err)
      setError(err instanceof Error ? err.message : "Errore durante il cambio password. Riprova.")
    }

    setIsSaving(false)
  }

  const passwordValidation = validatePassword(newPassword)
  const isPasswordValid = newPassword.length > 0 && passwordValidation.length === 0
  const doPasswordsMatch = newPassword === confirmPassword && confirmPassword.length > 0

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title="Profilo"
          subtitle="Gestisci il tuo account"
          breadcrumbs={[{ label: "Profilo", href: "/admin/profile" }]}
        />

        {/* Profile Info */}
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-[#8b7355] rounded-full flex items-center justify-center text-white">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-[#5c5c5c]">{adminUser.name}</h2>
              <p className="text-sm text-[#8b8b8b]">{adminUser.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[#8b7355]/10 text-[#8b7355] text-xs rounded-full">
                {getRoleLabel(adminUser.role)}
              </span>
            </div>
          </div>

          <div className="border-t border-[#e5e5e5] pt-4">
            <h3 className="text-sm font-medium text-[#5c5c5c] mb-3">Permessi</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-sm">
                {adminUser.can_upload ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className="text-[#8b8b8b]">Upload foto</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {adminUser.can_delete ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className="text-[#8b8b8b]">Elimina foto</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {adminUser.can_move ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className="text-[#8b8b8b]">Sposta foto</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {adminUser.can_manage_users ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className="text-[#8b8b8b]">Gestione utenti</span>
              </div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#8b7355]/10 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#8b7355]" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-[#5c5c5c]">Cambia Password</h2>
              <p className="text-sm text-[#8b8b8b]">Aggiorna la tua password di accesso</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          <div className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Password Attuale</label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Inserisci la password attuale"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b8b] hover:text-[#5c5c5c]"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Nuova Password</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Inserisci la nuova password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b8b] hover:text-[#5c5c5c]"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Requirements */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-[#8b8b8b]">Requisiti password:</p>
                  <div className="grid grid-cols-2 gap-1">
                    <div
                      className={`text-xs flex items-center gap-1 ${newPassword.length >= 8 ? "text-green-600" : "text-red-500"}`}
                    >
                      {newPassword.length >= 8 ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Almeno 8 caratteri
                    </div>
                    <div
                      className={`text-xs flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? "text-green-600" : "text-red-500"}`}
                    >
                      {/[A-Z]/.test(newPassword) ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Una maiuscola
                    </div>
                    <div
                      className={`text-xs flex items-center gap-1 ${/[a-z]/.test(newPassword) ? "text-green-600" : "text-red-500"}`}
                    >
                      {/[a-z]/.test(newPassword) ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Una minuscola
                    </div>
                    <div
                      className={`text-xs flex items-center gap-1 ${/[0-9]/.test(newPassword) ? "text-green-600" : "text-red-500"}`}
                    >
                      {/[0-9]/.test(newPassword) ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Un numero
                    </div>
                    <div
                      className={`text-xs flex items-center gap-1 ${/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? "text-green-600" : "text-red-500"}`}
                    >
                      {/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      Un carattere speciale
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Conferma Nuova Password</label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Conferma la nuova password"
                  className={`pr-10 ${confirmPassword.length > 0 && !doPasswordsMatch ? "border-red-500" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b8b] hover:text-[#5c5c5c]"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !doPasswordsMatch && (
                <p className="text-xs text-red-500 mt-1">Le password non coincidono</p>
              )}
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={!isPasswordValid || !doPasswordsMatch || isSaving}
              className="w-full bg-[#8b7355] hover:bg-[#6d5a43] text-white mt-4"
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isSaving ? "Salvataggio..." : "Salva Nuova Password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
