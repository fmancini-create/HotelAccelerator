import Link from "next/link"
import { ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <main className="min-h-full bg-muted flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl p-8 text-center max-w-md">
        <div className="w-16 h-16 bg-ha-error-soft rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-ha-error-soft-foreground" />
        </div>
        <h1 className="text-2xl font-semibold text-muted-foreground mb-2">Accesso Non Autorizzato</h1>
        <p className="text-muted-foreground mb-6">
          Il tuo account non ha i permessi per accedere all area admin. Contatta un Super Admin per richiedere laccesso.
        </p>
        <Link href="/">
          <Button className="bg-ha-brand hover:bg-ha-brand/90">Torna alla Home</Button>
        </Link>
      </div>
    </main>
  )
}
