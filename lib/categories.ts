export interface Category {
  id: string
  value: string
  label: string
  path: string
  pages: string[] // Pagine dove la categoria viene mostrata
  isCustom?: boolean
}

// Pagine disponibili nel sito
export const SITE_PAGES = [
  { value: "home", label: "Homepage" },
  { value: "camere", label: "Camere (elenco)" },
  { value: "suite", label: "Pagina Suite" },
  { value: "suite-private-access", label: "Pagina Suite Private Access" },
  { value: "tuscan-style", label: "Pagina Tuscan Style" },
  { value: "dependance", label: "Pagina Dependance" },
  { value: "ristorante", label: "Pagina Ristorante" },
  { value: "piscina", label: "Pagina Piscina & Spa" },
  { value: "giardino", label: "Pagina Giardino" },
  { value: "gallery", label: "Gallery Generale" },
]

// Categorie predefinite
const DEFAULT_CATEGORIES: Category[] = [
  { id: "1", value: "suite", label: "Suite", path: "/images/suite", pages: ["home", "camere", "suite", "gallery"] },
  {
    id: "2",
    value: "suite-private-access",
    label: "Suite Private Access",
    path: "/images/suite-private-access",
    pages: ["home", "camere", "suite-private-access", "gallery"],
  },
  {
    id: "3",
    value: "tuscan-style",
    label: "Tuscan Style",
    path: "/images/tuscan-style",
    pages: ["home", "camere", "tuscan-style", "gallery"],
  },
  {
    id: "4",
    value: "dependance-deluxe",
    label: "Dependance Deluxe",
    path: "/images/dependance/deluxe",
    pages: ["camere", "dependance", "gallery"],
  },
  {
    id: "5",
    value: "dependance-economy",
    label: "Economy Accesso Privato",
    path: "/images/dependance/economy",
    pages: ["camere", "dependance", "gallery"],
  },
  { id: "6", value: "piscina", label: "Piscina", path: "/images/piscina", pages: ["home", "piscina", "gallery"] },
  {
    id: "7",
    value: "ristorante",
    label: "Ristorante",
    path: "/images/ristorante",
    pages: ["home", "ristorante", "gallery"],
  },
  { id: "8", value: "giardino", label: "Giardino", path: "/images/giardino", pages: ["home", "giardino", "gallery"] },
  { id: "9", value: "common", label: "Aree Comuni", path: "/images/common", pages: ["home", "gallery"] },
]

const STORAGE_KEY = "villa-barronci-categories"

export function getCategories(): Category[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return DEFAULT_CATEGORIES
    }
  }
  return DEFAULT_CATEGORIES
}

export function saveCategories(categories: Category[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
}

export function addCategory(category: Omit<Category, "id">): Category[] {
  const categories = getCategories()
  const newCategory: Category = {
    ...category,
    id: Date.now().toString(),
    isCustom: true,
  }
  const updated = [...categories, newCategory]
  saveCategories(updated)
  return updated
}

export function updateCategory(id: string, updates: Partial<Category>): Category[] {
  const categories = getCategories()
  const updated = categories.map((cat) => (cat.id === id ? { ...cat, ...updates } : cat))
  saveCategories(updated)
  return updated
}

export function deleteCategory(id: string): Category[] {
  const categories = getCategories()
  const updated = categories.filter((cat) => cat.id !== id)
  saveCategories(updated)
  return updated
}

export function getCategoryPath(value: string): string {
  const categories = getCategories()
  return categories.find((c) => c.value === value)?.path || `/images/${value}`
}
