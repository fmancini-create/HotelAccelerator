alter table public.customer_accounts
  alter column property_id drop not null,
  alter column account_number set default nextval('public.customer_account_number_sequence'::regclass);

comment on column public.customer_accounts.property_id is
  'HotelAccelerator property when the customer owns HA; null for standalone satellite-product customers.';
