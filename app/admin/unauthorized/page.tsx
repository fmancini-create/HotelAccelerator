import Link from "next/link"
import { ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-serif text-[#5c5c5c] mb-2">Accesso Non Autorizzato</h1>
        <p className="text-[#8b8b8b] mb-6">
          Il tuo account non ha i permessi per accedere all area admin. Contatta un Super Admin per richiedere laccesso.
        </p>
        <Link href="/">
          <Button className="bg-[#8b7355] hover:bg-[#6b5a45]">Torna alla Home</Button>
        </Link>
      </div>
    </main>
  )
}
