"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useLanguage, type Language } from "@/lib/language-context"

export function Footer() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  })

  const { language, setLanguage } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()

  const LANGUAGES = [
    { code: "it" as Language, label: "Italiano", flag: "🇮🇹" },
    { code: "en" as Language, label: "English", flag: "🇬🇧" },
    { code: "fr" as Language, label: "Français", flag: "🇫🇷" },
    { code: "de" as Language, label: "Deutsch", flag: "🇩🇪" },
    { code: "nl" as Language, label: "Nederlands", flag: "🇳🇱" },
  ]

  const handleLanguageChange = (langCode: Language) => {
    setLanguage(langCode)

    if (pathname === "/" || pathname === "/en" || pathname === "/de" || pathname === "/fr") {
      if (langCode === "it") {
        router.push("/")
      } else {
        router.push(`/${langCode}`)
      }
    }
  }

  return (
    <footer className="bg-[#3a3a3a] text-white">
      <div className="border-b border-white/10">
        <div className="container mx-auto px-6 py-4 text-center">
          <a href="#toppage" className="inline-block text-white hover:text-[#2ea3f2] transition-colors">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z" />
            </svg>
          </a>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 items-center justify-items-center">
          <img
            src="/images/design-mode/villa-i-barronci.png"
            alt="Villa I Barronci"
            className="h-12 w-auto"
          />
          <img
            src="/images/design-mode/namaste4.png"
            alt="Namaste"
            className="h-12 w-auto"
          />
          <img
            src="/images/design-mode/terrazza-tiberio.png"
            alt="Terrazza Tiberio"
            className="h-12 w-auto"
          />
          <img
            src="/images/design-mode/da-tiberio.png"
            alt="da Tiberio"
            className="h-12 w-auto"
          />
        </div>

        <div className="text-center mb-8 text-sm">
          <p className="mb-1">I Barronci s.r.l.</p>
          <p className="mb-1">Via Sorripa, 10 50026 San Casciano In Val Di Pesa (FI), Italia</p>
          <p className="mb-3">
            +39 055820598 –{" "}
            <a href="mailto:info@ibarronci.com" className="hover:text-[#2ea3f2]">
              info@ibarronci.com
            </a>
          </p>
          <p className="text-xs mb-3">P.IVA e CF: 05194480488</p>
          <p className="text-xs">
            <a
              href="https://blobs.vusercontent.net/blob/Elenco_Trasparenza_Aiuti_IBARRONCI_m-WB9ouJA2J6mXqkNyIxF8OtctwonfMT.pdf"
              target="_blank"
              className="hover:text-[#2ea3f2]"
              rel="noreferrer"
            >
              Aiuti di Stato
            </a>
          </p>
        </div>

        <div className="text-center mb-8 text-xs">
          <a href="https://www.iubenda.com/privacy-policy/35594411/full-legal" className="hover:text-[#2ea3f2]">
            PRIVACY POLICY
          </a>
          {" – "}
          <a href="https://www.iubenda.com/privacy-policy/35594411/cookie-policy" className="hover:text-[#2ea3f2]">
            COOKIE POLICY
          </a>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          <a
            href="https://www.facebook.com/VillaiBarronci"
            className="w-10 h-10 border border-white flex items-center justify-center hover:bg-white hover:text-[#3a3a3a] transition-all"
            target="_blank"
            rel="noreferrer"
          >
            <span className="sr-only">Facebook</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com/villaibarronci/"
            className="w-10 h-10 border border-white flex items-center justify-center hover:bg-white hover:text-[#3a3a3a] transition-all"
            target="_blank"
            rel="noreferrer"
          >
            <span className="sr-only">Instagram</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-4.358-.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.059 1.69.073 4.948.073 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </a>
          <a
            href="https://www.tripadvisor.it/Hotel_Review-g652039-d501879-Reviews-Villa_I_Barronci_Resort_Spa-San_Casciano_in_Val_di_Pesa_Tuscany.html"
            className="w-10 h-10 border border-white flex items-center justify-center hover:bg-white hover:text-[#3a3a3a] transition-all"
            target="_blank"
            rel="noreferrer"
          >
            <span className="sr-only">TripAdvisor</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
          </a>
        </div>

        <div className="flex justify-center gap-3 mb-8">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                language === lang.code
                  ? "bg-[#8b7355] text-white border-[#8b7355] scale-110"
                  : "bg-white/10 text-white border-white/20 hover:border-[#8b7355] hover:bg-white/20"
              }`}
              title={lang.label}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className="text-sm hidden sm:inline">{lang.label}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-center mb-8">
          <img
            src="/images/design-mode/tripadvisor2.webp"
            alt="TripAdvisor Travellers' Choice Awards"
            className="h-32"
          />
        </div>

        <div className="text-center text-xs text-white/60 flex items-center justify-center gap-2">
          <span>Web design by</span>
          <a
            href="https://www.4bid.it"
            target="_blank"
            className="hover:opacity-80 transition-opacity inline-flex items-center"
            rel="noreferrer"
          >
            <img src="/images/4bid-logo.png" alt="4 Bid srl" className="h-8 w-auto" />
          </a>
          <span className="mx-2 text-white/30">|</span>
          <a
            href="/super-admin"
            className="text-white/40 hover:text-white/80 transition-colors text-[10px]"
            title="Accesso Piattaforma"
          >
            Platform
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
