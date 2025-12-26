import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-2xl font-semibold">Pagina non trovata</h2>
        <p className="text-muted-foreground max-w-md">La pagina che stai cercando non esiste o è stata spostata.</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Torna alla Home
          </Link>
          <Link href="/admin" className="px-6 py-3 border border-border rounded-md hover:bg-accent transition-colors">
            Vai all&apos;Admin
          </Link>
        </div>
      </div>
    </div>
  )
}
