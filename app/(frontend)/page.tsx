import { isPlatformDomain, getCurrentTenant } from "@/lib/get-tenant"
import { PlatformLanding } from "@/components/platform/platform-landing"
import { TenantHomePage } from "@/components/tenant/tenant-home-page"

export default async function HomePage() {
  const isPlatform = await isPlatformDomain()

  // Se siamo sul dominio piattaforma, mostra landing HotelAccelerator
  if (isPlatform) {
    return <PlatformLanding />
  }

  // Altrimenti mostra il sito del tenant
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return null // Il layout gestisce l'errore
  }

  return <TenantHomePage tenant={tenant} />
}
