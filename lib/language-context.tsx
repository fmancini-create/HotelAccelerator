"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

export type Language = "it" | "en" | "fr" | "de" | "nl"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("it")

  // Load language from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("site-language") as Language
    if (saved && ["it", "en", "fr", "de", "nl"].includes(saved)) {
      setLanguage(saved)
    }
  }, [])

  // Save language to localStorage when it changes
  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem("site-language", lang)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage }}>{children}</LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
