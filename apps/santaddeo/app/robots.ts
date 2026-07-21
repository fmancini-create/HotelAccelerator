import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Regole per tutti i crawler standard (Googlebot, Bingbot, etc.)
      // IMPORTANTE: allow "/" permette tutte le pagine di default.
      // disallow blocca solo le sezioni private/admin.
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/superadmin/",
          "/dashboard/",
          "/dashboard-v2/",
          "/dashboard-v3/",
          "/accelerator/",
          "/settings/",
          "/auth/callback",
          "/auth/reset-password",
          "/auth/verify-email",
          "/auth/forgot-password",
          "/team/",
          "/dati/",
          "/bookings/",
          "/upgrade/consultation",
          "/upgrade/premium-expert",
          // Aree dashboard interne sales (lead management, commissioni).
          // Pagine che vivono fuori da /dashboard/* per ragioni storiche.
          "/sales/",
          // /upgrade/hotel-accelerator e' pubblica e indicizzabile,
          // ma /upgrade base e' la lista post-login; la teniamo non
          // indicizzata via meta robots noindex sulla pagina stessa
          // (defense in depth) ma NON la blocchiamo qui per non rompere
          // i link interni che ci atterrano dopo il signup.
          "/coming-soon",
          // 19/05/2026: aggiunte aree post-auth/utility che il crawler
          // non deve indicizzare (consumano crawl budget senza dare valore
          // SEO). Restano comunque accessibili agli utenti loggati.
          "/onboarding/",
          "/calendar/",
          "/occupancy/",
          "/login",
          "/signup",
          "/error",
        ],
      },
      // AI crawlers ereditano le stesse regole del wildcard "*" sopra.
      // Non serve duplicare: la regola "*" copre tutti i bot non specificati.
      // Aggiungiamo solo una nota per i file llms.txt che sono gia in allow "/"
    ],
    sitemap: "https://www.santaddeo.com/sitemap.xml",
  }
}
