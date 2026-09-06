import Link from "next/link"

import { HotelAcceleratorLogo } from "@/components/brand/hotel-accelerator-logo"
import { Button } from "@/components/ui/button"

export const HOTELACCELERATOR_DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"

const MAIN_LINKS = [
  { href: "/#moduli", label: "Moduli" },
  { href: "/#attivazione", label: "Attivazione" },
  { href: "/#faq", label: "FAQ" },
] as const

export function PlatformPublicHeader({ showNavigation = true }: { showNavigation?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/" className="flex shrink-0 items-center" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorLogo
              markClassName="h-8 w-8"
              markSizes="32px"
              textClassName="text-xl font-semibold tracking-tight text-foreground"
              priority
            />
          </Link>

          {showNavigation ? (
            <nav className="hidden items-center gap-5 lg:flex" aria-label="Navigazione principale">
              {MAIN_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Button asChild variant="ghost" size="sm" className="px-2 sm:h-10 sm:px-4">
            <Link href="/admin">Accedi</Link>
          </Button>
          <Button asChild size="sm" className="whitespace-nowrap px-2 sm:h-10 sm:px-4">
            <a href={HOTELACCELERATOR_DEMO_URL} target="_blank" rel="noopener noreferrer">
              Prenota una demo
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
