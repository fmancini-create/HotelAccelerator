# Acceptance — WhatsApp billing gestito da 4BID

- Tenant UI non espone configurazione manuale Meta, token, WABA, webhook o billing.
- POST manuale `/api/channels/whatsapp` rifiuta un tenant admin con 403 e resta disponibile solo al superadmin per recovery.
- Embedded Signup salva routing e credenziali tenant-scoped come prima.
- Embedded Signup tenta il billing 4BID senza chiedere al tenant di entrare in Meta.
- La tabella `platform_whatsapp_billing` non è accessibile ad anon/authenticated.
- Il cron di riconciliazione è protetto da `CRON_SECRET` ed evita WABA già allocati.
- Il superadmin può leggere lo stato e rilanciare la riconciliazione tramite API dedicata.
- Assenza di extended credit line Meta produce stato `blocked`, non un link Meta mostrato al tenant.
- Il tenant conserva isolamento dati, numero e WABA; la linea di credito non cambia il routing.
- Typecheck Core e build Next.js devono passare prima del merge.
