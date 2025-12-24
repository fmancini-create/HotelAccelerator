// Sistema di gestione utenti admin
export type UserRole = "super_admin" | "admin" | "editor"

export interface AdminUser {
  email: string
  password: string
  name: string
  role: UserRole
  permissions: {
    canUpload: boolean
    canDelete: boolean
    canMove: boolean
    canManageUsers: boolean
  }
}

// Database utenti (in produzione usare un database reale)
export const ADMIN_USERS: AdminUser[] = [
  {
    email: "f.mancini@ibarronci.com",
    password: "Admin2024!",
    name: "Filippo Mancini",
    role: "super_admin",
    permissions: {
      canUpload: true,
      canDelete: true,
      canMove: true,
      canManageUsers: true,
    },
  },
  {
    email: "admin@ibarronci.com",
    password: "Admin2024!",
    name: "Admin",
    role: "admin",
    permissions: {
      canUpload: true,
      canDelete: true,
      canMove: true,
      canManageUsers: false,
    },
  },
  {
    email: "editor@ibarronci.com",
    password: "Editor2024!",
    name: "Editor",
    role: "editor",
    permissions: {
      canUpload: true,
      canDelete: false,
      canMove: true,
      canManageUsers: false,
    },
  },
]

const CUSTOM_PASSWORDS_KEY = "admin_custom_passwords"

export function getCustomPasswords(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(CUSTOM_PASSWORDS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function authenticateUser(email: string, password: string): AdminUser | null {
  const user = ADMIN_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
  return user || null
}

export function authenticateUserWithCustomPassword(email: string, password: string): AdminUser | null {
  const user = ADMIN_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user) return null

  const customPasswords = getCustomPasswords()
  const customPassword = customPasswords[email.toLowerCase()]

  if (customPassword) {
    return password === customPassword ? user : null
  }

  return password === user.password ? user : null
}

export function getUserByEmail(email: string): AdminUser | null {
  return ADMIN_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "Super Admin"
    case "admin":
      return "Amministratore"
    case "editor":
      return "Editor"
    default:
      return role
  }
}

export function getCurrentUser(): AdminUser | null {
  if (typeof window === "undefined") return null

  try {
    const session = localStorage.getItem("admin_session")
    if (!session) return null

    const { email, expiry } = JSON.parse(session)

    if (Date.now() > expiry) {
      localStorage.removeItem("admin_session")
      return null
    }

    return getUserByEmail(email)
  } catch {
    return null
  }
}

export function logout(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem("admin_session")
}

export function login(user: AdminUser): void {
  if (typeof window === "undefined") return

  const session = {
    email: user.email,
    expiry: Date.now() + 24 * 60 * 60 * 1000,
  }
  localStorage.setItem("admin_session", JSON.stringify(session))
}

export function changePassword(email: string, newPassword: string): boolean {
  if (typeof window === "undefined") return false

  const user = ADMIN_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user) return false

  const customPasswords = getCustomPasswords()
  customPasswords[email.toLowerCase()] = newPassword
  localStorage.setItem(CUSTOM_PASSWORDS_KEY, JSON.stringify(customPasswords))

  return true
}
