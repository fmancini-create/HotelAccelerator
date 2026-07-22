"use client"

import { useRouter } from "next/navigation"
import { Building2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  userName: string
  hotels: string[]
}

export function ChooseProfileClient({ userName, hotels }: Props) {
  const router = useRouter()

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">Bentornato, {userName}!</CardTitle>
        <CardDescription className="text-base">
          Il tuo account ha accesso a piu&apos; aree della piattaforma.
          <br />
          Seleziona con quale profilo vuoi accedere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Opzione Venditore */}
        <button
          type="button"
          onClick={() => router.push("/sales")}
          className="w-full flex items-start gap-4 p-4 rounded-lg border-2 border-transparent bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100 transition-all text-left group"
        >
          <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-900">Area Venditori</div>
            <div className="text-sm text-emerald-700">
              Gestisci i tuoi lead, monitora le commissioni e le statistiche di vendita.
            </div>
          </div>
        </button>

        {/* Opzione Tenant */}
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="w-full flex items-start gap-4 p-4 rounded-lg border-2 border-transparent bg-amber-50 hover:border-amber-300 hover:bg-amber-100 transition-all text-left group"
        >
          <div className="shrink-0 w-12 h-12 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
            <Building2 className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-900">Dashboard Struttura</div>
            <div className="text-sm text-amber-700">
              Accedi alla dashboard delle tue strutture
              {hotels.length > 0 && (
                <span className="block mt-1 text-xs text-amber-600">
                  {hotels.slice(0, 2).join(", ")}
                  {hotels.length > 2 && ` +${hotels.length - 2} altre`}
                </span>
              )}
            </div>
          </div>
        </button>

        <p className="text-xs text-center text-muted-foreground pt-2">
          Puoi sempre cambiare profilo dal menu utente in alto a destra.
        </p>
      </CardContent>
    </Card>
  )
}
