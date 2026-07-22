-- Catalogo moduli/addon: sorgente di verità per prezzi, trial, feature e
-- visibilità sulle pagine pubbliche. Gestito dal pannello superadmin.
-- Idempotente: eseguibile più volte senza effetti collaterali.

create table if not exists module_catalog (
  key text primary key,
  name text not null,
  description text not null default '',
  category text not null default 'addon', -- 'addon' | 'module'
  price_cents integer not null default 0,
  currency text not null default 'eur',
  billing_interval text not null default 'year', -- 'year' | 'month'
  trial_days integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,   -- visibile sulle pagine pubbliche
  is_purchasable boolean not null default true, -- checkout abilitato
  stripe_product_id text,
  stripe_price_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed iniziale dai valori storici di lib/products.ts (idempotente: aggiorna
-- solo nome/descrizione/feature, NON sovrascrive prezzo/trial/flag se già
-- modificati dal superadmin, e NON tocca gli id Stripe già sincronizzati).
insert into module_catalog (key, name, description, category, price_cents, billing_interval, trial_days, features, sort_order)
values
  ('premium_expert', 'Premium Expert',
   'Inoltra le conversazioni AI al tuo consulente Revenue Management personale',
   'addon', 49900, 'year', 0,
   '["Inoltro conversazioni AI a esperto RM","Risposta entro 24-48 ore lavorative","Consigli strategici personalizzati","Report mensile di performance","Supporto prioritario"]'::jsonb,
   10),
  ('booking_pace', 'Booking Pace',
   'Monitora l''on-the-books e il ritmo di prenotazione rispetto allo stesso periodo dell''anno scorso',
   'module', 39900, 'year', 0,
   '["On-the-books per ogni notte futura","Confronto STLY (stesso momento anno scorso)","Pickup a 7 / 14 / 30 giorni","Curva di prenotazione anno corrente vs anno scorso","Segnale di domanda integrato nel motore prezzi"]'::jsonb,
   20),
  ('rate_shopper', 'Rate Shopper',
   'Confronta i tuoi prezzi con quelli del tuo set competitivo, giorno per giorno',
   'module', 59900, 'year', 0,
   '["Comp set personalizzabile per struttura","Confronto prezzi competitor vs i tuoi","Posizionamento min / mediana / max di mercato","Inserimento manuale e import CSV","Pronto per provider esterni di rate shopping"]'::jsonb,
   30)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Default piani base RMS (1 riga singleton): il superadmin imposta i default
-- usati alla creazione di una nuova subscription per-hotel.
create table if not exists rms_plan_defaults (
  id integer primary key default 1,
  default_fixed_fee_cents integer not null default 0,
  default_commission_pct numeric(5,2) not null default 0,
  default_trial_days integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint rms_plan_defaults_singleton check (id = 1)
);

insert into rms_plan_defaults (id) values (1) on conflict (id) do nothing;
