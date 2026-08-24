-- Backfill necessario per le installazioni che hanno gia' ricevuto il primo
-- rilascio del registro con il solo codice HA.

begin;

insert into public.customer_product_codes (customer_account_id, product_key)
select a.id, product.product_key
from public.customer_accounts a
cross join (values ('hotelaccelerator'), ('santaddeo'), ('hotelprofitai'), ('manubot')) as product(product_key)
on conflict (customer_account_id, product_key) do nothing;

commit;
