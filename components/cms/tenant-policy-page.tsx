import Link from "next/link"
import { FourBidCredit } from "@/components/cms/four-bid-credit"
import { legalDetails, type TenantSiteSettings } from "@/lib/cms/tenant-site-settings"

export function TenantPolicyPage({ kind, settings }: { kind: "privacy" | "cookie"; settings: TenantSiteSettings }) {
  const title = kind === "privacy" ? "Privacy Policy" : "Cookie Policy"
  const content = kind === "privacy" ? settings.privacyPolicy : settings.cookiePolicy
  return <main className="min-h-screen bg-white px-5 py-16 text-neutral-900">
    <article className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm underline">Torna al sito</Link>
      <h1 className="mt-8 text-4xl font-semibold">{title}</h1>
      <div className="mt-8 whitespace-pre-wrap text-base leading-7 text-neutral-700">{content}</div>
      <div className="mt-12 border-t pt-6 text-xs text-neutral-500">{legalDetails(settings).join(" · ")}</div>
      {!settings.whiteLabel && <div className="mt-6"><FourBidCredit /></div>}
    </article>
  </main>
}
