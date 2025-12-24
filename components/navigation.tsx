"use client"

import { useState, useRef } from "react"
import { ChevronDown } from "lucide-react"
import { Facebook, Instagram } from "lucide-react"
import { useAdminAuth } from "@/lib/admin-hooks"

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { adminUser } = useAdminAuth() || { adminUser: null }

  const handleMouseEnter = (menu: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setOpenSubmenu(menu)
  }

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu(null)
    }, 150) // 150ms delay before closing
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#3a3a3a] text-white text-xs">
        <div className="container mx-auto px-6 py-2 flex justify-end items-center gap-6">
          <div className="flex items-center gap-4">
            <a href="https://www.facebook.com/VillaiBarronci" className="hover:opacity-80 transition-opacity">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="https://www.instagram.com/villaibarronci/" className="hover:opacity-80 transition-opacity">
              <Instagram className="w-4 h-4" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://ibarronci.com/en/villa-i-barronci-resort-spa-in-chianti-near-florence/"
              className="hover:opacity-80"
            >
              <img
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAALCAMAAABBPP0LAAAAt1BMVEWSmb66z+18msdig8La3u+tYX9IaLc7W7BagbmcUW+kqMr/q6n+//+hsNv/lIr/jIGMnNLJyOP9/fyQttT/wb3/////aWn+YWF5kNT0oqz0i4ueqtIZNJjhvt/8gn//WVr/6+rN1+o9RKZwgcMPJpX/VFT9UEn+RUX8Ozv2Ly+FGzdYZrfU1e/8LS/lQkG/mbVUX60AE231hHtcdMb0mp3qYFTFwNu3w9prcqSURGNDaaIUMX5FNW5wYt7AAAAAjklEQVR4AR3HNUJEMQCGwf+L8RR36ajR+1+CEuvRdd8kK9MNAiRQNgJmVDAt1yM6kSzYVJUsPNssAk5N7ZFKjVNFAY4co6TAOI+kyQm+LFUEBEKKzuWUNB7rSH/rSnvOulOGk+QlXTBqMIrfYX4tSe2nP3iRa/KNK7uTmWJ5a9+erZ3d+18od4ytiZdvZyuKWy8o3UpTVAAAAABJRU5ErkJggg=="
                alt="English"
                width="16"
                height="11"
              />
            </a>
            <a href="https://ibarronci.com/" className="hover:opacity-80">
              <img
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAALCAMAAABBPP0LAAAAUVBMVEUAiQAAgADk5OTe3t7vAAB3yXf9/f36+vr5Vlb3RkZjwWNYvVj4+Pj1MzP1KChQuFD1GxviAABHtUf19fXzDw4/sT8AcAA2qzYAWgDLy8vDw8ObXclsAAAAVElEQVR4AQXBSwoCQRQEsNT70CC69P5XdCUMA2ISSAiBWAQScg8bN7GJWxFDrCivwhCLMipGx3LKUOi2HAZluy2HgXprxQGfGL6G63B5MJ5FCD/4A3DaCLvbBle5AAAAAElFTkSuQmCC"
                alt="Italiano"
                width="16"
                height="11"
              />
            </a>
            <a
              href="https://ibarronci.com/fr/i-barronci-resort-spa-dans-le-chianti-accueil/"
              className="hover:opacity-80"
            >
              <img
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAALCAMAAABBPP0LAAAAbFBMVEVzldTg4ODS0tLxDwDtAwDjAADD0uz39/fy8vL3k4nzgna4yOixwuXu7u7s6+zn5+fyd2rvcGPtZljYAABrjNCpvOHrWkxegsqfs93NAADpUUFRd8THAABBa7wnVbERRKa8vLyxsLCoqKigoKClCvcsAAAAXklEQVR4AS3JxUEAQQAEwZo13Mk/R9w5/7UERJCIGIgj5qfRJZEpPyNfCgJTjMR1eRRnJiExFJz5Mf1PokWr/UztIjRGQ3V486u0HO55m634U6dMcf0RNPfkVCTvKjO16xHA8miowAAAAABJRU5ErkJggg=="
                alt="Français"
                width="16"
                height="11"
              />
            </a>
            <a
              href="https://ibarronci.com/de/villa-i-barronci-resort-spa-im-chianti-bei-florenz/"
              className="hover:opacity-80"
            >
              <img
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAALCAIAAAD5gJpuAAABLElEQVR4AY2QgUZEQRSGz9ydmzbYkBWABBJYABHEFhJ6m0WP0DMEQNIr9AKrN8ne2Tt3Zs7MOdOZmRBEv+v34Tvub9R6fdNlAzU+snSME/wdjbjbbJ6EiEg6BA8102QbjKNpoMzw8v6qD/sOALbbT2MC1NgaAWOKOgxf5czY+4dbAX2G/THzcozLrvPV85IQyqVz0rvg2p9Pei4HjzSsiFbV4JgyhhxCjpGdZ0RhdikLB9/b8Qig7MkpSovR7Cp59q6CazaNFiTt4J82o6uvdMVwTsztKTXZod4jgOJJuqNAjFyGrBR8gM6XwKfIC4KanBSTZ0rClKh08D9DFh3egW7ebH7NcRDQWrz9rM2Ne+mDOXB2mZJ8agL19nwxR2iZXGm1gDbQKhDjd4yHb2oW/KR8xHicAAAAAElFTkSuQmCC"
                alt="Deutsch"
                width="16"
                height="11"
              />
            </a>
          </div>
        </div>
      </div>

      <header className="fixed top-8 left-0 right-0 z-40 bg-[#3a3a3a]/95 backdrop-blur-sm transition-all duration-400">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <a href="/">
              <img
                src="https://ibarronci.com/wp-content/uploads/2023/07/villaibarronci-logo-orizzontale-700.png"
                alt="Villa I Barronci Resort & Spa"
                className="h-12 md:h-16 w-auto object-contain"
                width="700"
                height="143"
              />
            </a>

            <nav className="hidden lg:block">
              <ul className="flex items-center gap-6 text-white text-sm">
                <li>
                  <a
                    href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
                    target="_blank"
                    className="px-6 py-2 hover:opacity-80 transition-opacity uppercase font-semibold whitespace-nowrap"
                    rel="noreferrer"
                  >
                    PRENOTA ORA!
                  </a>
                </li>
                <li
                  className="relative"
                  onMouseEnter={() => handleMouseEnter("camere")}
                  onMouseLeave={handleMouseLeave}
                >
                  <button className="flex items-center gap-1 hover:text-[#2ea3f2] transition-colors py-2">
                    Camere & Suites
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {openSubmenu === "camere" && (
                    <div className="absolute top-full left-0 pt-1">
                      <div className="bg-[#2c2c2c] shadow-lg min-w-[200px] py-2">
                        <a href="/camere/economy" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Camera Economy
                        </a>
                        <a
                          href="/camere/economy-accesso-privato"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Economy Accesso Privato
                        </a>
                        <a href="/camere/tuscan-style" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Camera Tuscan Style
                        </a>
                        <a
                          href="/camere/tuscan-superior"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Camera Tuscan Superior
                        </a>
                        <a href="/camere/suite" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Suite
                        </a>
                        <a
                          href="/camere/suite-private-access"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Suite Private Access
                        </a>
                        <a href="/camere/dependance" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Dépendance
                        </a>
                        <a
                          href="/camere/dependance-deluxe"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Dependance Deluxe
                        </a>
                      </div>
                    </div>
                  )}
                </li>
                <li>
                  <a href="/piscina-jacuzzi" className="hover:text-[#2ea3f2] transition-colors">
                    Piscina & Jacuzzi
                  </a>
                </li>
                <li className="relative" onMouseEnter={() => handleMouseEnter("spa")} onMouseLeave={handleMouseLeave}>
                  <button className="flex items-center gap-1 hover:text-[#2ea3f2] transition-colors py-2">
                    Spa
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {openSubmenu === "spa" && (
                    <div className="absolute top-full left-0 pt-1">
                      <div className="bg-[#2c2c2c] shadow-lg min-w-[200px] py-2">
                        <a
                          href="/spa/namaste-area-relax"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Namaste Area Relax
                        </a>
                        <a
                          href="/spa/massaggi-trattamenti"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Massaggi & Trattamenti
                        </a>
                      </div>
                    </div>
                  )}
                </li>
                <li className="relative" onMouseEnter={() => handleMouseEnter("info")} onMouseLeave={handleMouseLeave}>
                  <button className="flex items-center gap-1 hover:text-[#2ea3f2] transition-colors py-2">
                    Altre info
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {openSubmenu === "info" && (
                    <div className="absolute top-full left-0 pt-1">
                      <div className="bg-[#2c2c2c] shadow-lg min-w-[200px] py-2">
                        <a href="/dove-siamo" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Dove Siamo
                        </a>
                        <a href="/offerte-speciali" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Offerte Speciali
                        </a>
                        <a
                          href="/richiesta-informazioni"
                          className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors"
                        >
                          Richiesta Informazioni
                        </a>
                        <a href="/lavora-con-noi" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                          Opportunità di lavoro
                        </a>
                      </div>
                    </div>
                  )}
                </li>
                <li>
                  <a href="/prenota-esperienze" className="hover:text-[#2ea3f2] transition-colors">
                    Prenota le tue esperienze
                  </a>
                </li>
                <li>
                  <a href="https://shop.scidoo.com/?shop-id=1131" className="hover:text-[#2ea3f2] transition-colors">
                    Shop
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scidoo.com/app_uikit/landing_qrcode.php?IDstruttura=1131"
                    className="hover:text-[#2ea3f2] transition-colors"
                  >
                    Area Clienti
                  </a>
                </li>
                {!adminUser && (
                  <li>
                    <a
                      href="/admin"
                      className="flex items-center gap-2 hover:text-amber-400 transition-colors py-2 font-semibold border border-amber-600 px-3 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      Admin
                    </a>
                  </li>
                )}
                {adminUser?.role === "super_admin" && (
                  <li
                    className="relative"
                    onMouseEnter={() => handleMouseEnter("admin")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button className="flex items-center gap-1 hover:text-amber-400 transition-colors py-2 font-semibold">
                      Admin
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {openSubmenu === "admin" && (
                      <div className="absolute top-full right-0 pt-1">
                        <div className="bg-[#2c2c2c] shadow-lg min-w-[200px] py-2 border-2 border-amber-600">
                          <a href="/admin/dashboard" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                            Dashboard
                          </a>
                          <a href="/admin/photos" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                            Gestione Foto
                          </a>
                          <a href="/admin/gallery" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors">
                            Nuova Galleria
                          </a>
                          <div className="border-t border-gray-600 my-2"></div>
                          <a href="/" className="block px-4 py-2 hover:bg-[#3a3a3a] transition-colors text-amber-400">
                            ← Torna al sito
                          </a>
                        </div>
                      </div>
                    )}
                  </li>
                )}
              </ul>
            </nav>

            <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden text-white p-2" aria-label="Menu">
              <div className="w-6 h-5 flex flex-col justify-between">
                <span className="block h-0.5 w-full bg-white"></span>
                <span className="block h-0.5 w-full bg-white"></span>
                <span className="block h-0.5 w-full bg-white"></span>
              </div>
            </button>
          </div>
        </div>
      </header>

      {isOpen && (
        <div className="absolute top-20 left-0 right-0 bg-card shadow-lg">
          <div className="container mx-auto px-6 py-8">
            <div className="grid md:grid-cols-4 gap-8">
              <div>
                <h3 className="font-bold text-foreground mb-4">Camere & Suites</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <a href="/camere/economy" className="hover:text-foreground">
                    Camera Economy
                  </a>
                  <a href="/camere/economy-accesso-privato" className="hover:text-foreground">
                    Economy Accesso Privato
                  </a>
                  <a href="/camere/tuscan-style" className="hover:text-foreground">
                    Camera Tuscan Style
                  </a>
                  <a href="/camere/tuscan-superior" className="hover:text-foreground">
                    Camera Tuscan Superior
                  </a>
                  <a href="/camere/suite" className="hover:text-foreground">
                    Suite
                  </a>
                  <a href="/camere/suite-private-access" className="hover:text-foreground">
                    Suite Private Access
                  </a>
                  <a href="/camere/dependance" className="hover:text-foreground">
                    Dépendance
                  </a>
                  <a href="/camere/dependance-deluxe" className="hover:text-foreground">
                    Dependance Deluxe
                  </a>
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-foreground mb-4">Spa</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a href="/spa/namaste-area-relax" className="hover:text-foreground">
                      Namaste Area Relax
                    </a>
                  </li>
                  <li>
                    <a href="/spa/massaggi-trattamenti" className="hover:text-foreground">
                      Massaggi & Trattamenti
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-foreground mb-4">Altre info</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a href="/dove-siamo" className="hover:text-foreground">
                      Dove Siamo
                    </a>
                  </li>
                  <li>
                    <a href="/offerte-speciali" className="hover:text-foreground">
                      Offerte Speciali
                    </a>
                  </li>
                  <li>
                    <a href="/richiesta-informazioni" className="hover:text-foreground">
                      Richiesta Informazioni
                    </a>
                  </li>
                  <li>
                    <a href="/lavora-con-noi" className="hover:text-foreground">
                      Opportunità di lavoro
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-foreground mb-4 mt-8">Piscina & Jacuzzi</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a href="/piscina-jacuzzi" className="hover:text-foreground">
                      Piscina & Jacuzzi
                    </a>
                  </li>
                </ul>

                <h3 className="font-bold text-foreground mb-4 mt-8">Shop</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a href="https://shop.scidoo.com/?shop-id=1131" className="hover:text-foreground">
                      Shop
                    </a>
                  </li>
                </ul>

                <h3 className="font-bold text-foreground mb-4 mt-8">Area Clienti</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a
                      href="https://www.scidoo.com/app_uikit/landing_qrcode.php?IDstruttura=1131"
                      className="hover:text-foreground"
                    >
                      Area Clienti
                    </a>
                  </li>
                  {!adminUser && (
                    <li className="border-t border-gray-600 pt-4 mt-4">
                      <a
                        href="/admin"
                        className="hover:text-foreground flex items-center gap-2 text-amber-400 font-semibold"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        Admin Login
                      </a>
                    </li>
                  )}
                  {adminUser?.role === "super_admin" && (
                    <li>
                      <a href="/admin" className="hover:text-foreground">
                        Admin
                      </a>
                    </li>
                  )}
                </ul>

                <a
                  href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
                  target="_blank"
                  className="inline-block mt-6 px-6 py-3 bg-[#8b7355] text-white hover:bg-[#6d5a42] transition-colors"
                  rel="noreferrer"
                >
                  Prenota ora!
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Navigation
