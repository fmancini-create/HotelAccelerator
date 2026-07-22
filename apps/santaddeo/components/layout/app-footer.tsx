export function AppFooter() {
  return (
    <footer className="border-t bg-gray-50/80 py-4 mt-auto">
      <div className="container mx-auto px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Powered by</span>
            <img src="/logo-4bid.png" alt="4 BID S.r.l." width={60} height={20} className="opacity-70" />
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} 4 BID S.r.l. Tutti i diritti riservati.
          </p>
        </div>
      </div>
    </footer>
  )
}
