"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, FolderOpen, Send } from "lucide-react"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"

/**
 * One user-facing Inbox, multiple internal data sources.
 *
 * Operational conversations and the unified Sent projection are DB-driven.
 * Native email folders (including the provider's own Sent/Drafts) are read
 * directly from the provider under "Cartelle email" so they never pollute
 * customer-message, unread or KPI semantics.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const emailFoldersOpen = pathname.startsWith("/admin/inbox/email")
  const sentOpen = pathname.startsWith("/admin/inbox/sent")
  const subviewOpen = emailFoldersOpen || sentOpen

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/*
        Nella Inbox operativa questa barra non deve creare una seconda fascia
        vuota sopra la posta. Su desktop largo la riusiamo nello spazio libero
        a destra dell'header locale; nelle sottoviste e sui viewport piu'
        stretti resta invece nel normale flusso, cosi' non si sovrappone mai ai
        contenuti.
      */}
      <div
        data-inbox-toolbar
        data-inbox-toolbar-mode={subviewOpen ? "subview" : "operational"}
        className={[
          "z-[65] flex min-h-11 shrink-0 items-center border-b bg-card",
          subviewOpen
            ? "relative"
            : "relative 2xl:absolute 2xl:right-3 2xl:top-1 2xl:min-h-0 2xl:border-0 2xl:bg-transparent",
        ].join(" ")}
      >
        <div
          className={[
            "hidden shrink-0 sm:block",
            subviewOpen ? "w-[256px] px-3 py-1" : "w-[256px] px-3 py-1 2xl:w-auto 2xl:p-0",
          ].join(" ")}
        >
          <OmnichannelCompose />
        </div>

        <div
          className={[
            "flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1 sm:justify-end sm:px-3",
            !subviewOpen ? "2xl:flex-none 2xl:px-0 2xl:py-0" : "",
          ].join(" ")}
        >
          <span className="truncate text-sm font-semibold sm:sr-only">Inbox</span>

          {subviewOpen ? (
            <Link
              href="/admin/inbox"
              className="inline-flex min-h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Conversazioni</span>
            </Link>
          ) : (
            <>
              {/* Slot stabile: la traduzione non deve piu' infilarsi nella
                  toolbar filtri/azioni del messaggio, che ha spazio limitato. */}
              <div
                data-inbox-translation-slot
                className="relative hidden min-w-0 shrink-0 items-center gap-1.5 sm:flex"
                aria-live="polite"
              />

              <nav aria-label="Viste Inbox" className="flex shrink-0 items-center gap-1 sm:gap-2">
                <Link
                  href="/admin/inbox/sent"
                  className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  <span className="hidden lg:inline">Inviati</span>
                </Link>
                <Link
                  href="/admin/inbox/email"
                  className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden />
                  <span className="hidden lg:inline">Cartelle email</span>
                </Link>
              </nav>
            </>
          )}
        </div>
      </div>

      <div
        data-inbox-mobile
        data-inbox-view={emailFoldersOpen ? "email" : sentOpen ? "sent" : "operational"}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {children}
      </div>

      <div className="fixed bottom-4 left-4 z-[70] sm:hidden">
        <OmnichannelCompose />
      </div>

      <style>{`
        /* Il composer desktop fa parte della barra comune, ma la sua altezza
           standard (48px) rendeva l'intera fascia inutilmente alta. Qui lo
           rendiamo compatto senza cambiare il dialog o il composer mobile. */
        [data-inbox-toolbar] button[aria-label="Crea un nuovo messaggio"] {
          height: 2.25rem !important;
          gap: 0.5rem !important;
          border-radius: 0.75rem !important;
          padding-left: 0.875rem !important;
          padding-right: 0.875rem !important;
          white-space: nowrap !important;
        }

        /* La vista operativa aveva ancora l'header visuale derivato da Gmail:
           oltre a essere alto, mostrava il marchio del provider. Il provider e'
           un dettaglio del connettore: la UI tenant usa il marchio ufficiale HA. */
        [data-inbox-view="operational"] > div > header {
          height: 3.25rem !important;
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
          gap: 0.5rem !important;
        }

        [data-inbox-view="operational"] > div > header > div:first-of-type > svg:first-child {
          display: none !important;
        }

        [data-inbox-view="operational"] > div > header > div:first-of-type::before {
          content: "";
          width: 1.75rem;
          height: 1.75rem;
          flex: 0 0 1.75rem;
          background: url("/logo-ha-mark-64.png") center / contain no-repeat;
        }

        /*
          Da 2xl in su la barra comune occupa lo spazio libero a destra dello
          stesso header della Inbox. Riserviamo quello spazio all'header perche'
          ricerca e controlli comuni non possano mai sovrapporsi. Risultato:
          una riga verticale in meno e nessuna necessita' di scroll orizzontale.
        */
        @media (min-width: 1536px) {
          [data-inbox-toolbar-mode="operational"] {
            height: 2.75rem !important;
            max-width: calc(100% - 1.5rem);
          }

          [data-inbox-view="operational"] > div > header {
            padding-right: 44rem !important;
          }
        }

        /* The native mailbox page can use a generic envelope icon in its local
           heading. The unified Inbox shell already supplies the context, so
           remove only that redundant icon. Sent is NOT a mailbox page. */
        [data-inbox-view="email"] > .flex.h-full.min-h-0.flex-col.bg-card
          > .flex.flex-wrap.items-center.gap-3.border-b
          > .min-w-0
          > .flex.items-center.gap-2
          > svg {
          display: none !important;
        }

        @media (max-width: 639px) {
          [data-inbox-view="operational"] > div > header {
            height: 3rem !important;
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
          }

          [data-inbox-view="operational"] > div > header > div:first-of-type::before {
            width: 1.5rem;
            height: 1.5rem;
            flex-basis: 1.5rem;
          }
        }
      `}</style>
    </div>
  )
}
