import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageNavigation } from "@/components/layout/page-navigation"

interface HeaderProps {
  showAuth?: boolean
  size?: "default" | "small"
  /** Mostra i pulsanti Indietro/Home integrati nell'header (pagine interne pubbliche). */
  showPageNav?: boolean
}

export function Header({ showAuth = true, size = "default", showPageNav = false }: HeaderProps) {
  const logoSize = size === "small" ? { width: 140, height: 42 } : { width: 160, height: 48 }

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center shrink-0 overflow-hidden"
            style={{ width: logoSize.width, height: logoSize.height }}
          >
            <img
              src="/logo-santaddeo.png"
              alt="SANTADDEO"
              width={logoSize.width}
              height={logoSize.height}
              className="h-full w-auto object-contain"
            />
          </Link>
          <nav className="hidden md:flex items-center gap-6" aria-label="Navigazione principale">
            <Link href="/features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Funzionalita
            </Link>
            <Link href="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Chi Siamo
            </Link>
            <Link href="/request-info" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Contatti
            </Link>
            <Link href="/parlano-di-noi" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Parlano di noi
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* Pulsanti Indietro/Home integrati nell'header (homeUrl="/" per il pubblico) */}
          {showPageNav && <PageNavigation homeUrl="/" className="hidden sm:flex" />}
          {showAuth && (
            <>
              <Link href="/auth/login">
                <Button variant="ghost">Accedi</Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button>Registrati Gratis</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
