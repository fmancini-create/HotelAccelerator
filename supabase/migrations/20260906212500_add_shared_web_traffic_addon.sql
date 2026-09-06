insert into public.modules (
  key,
  name,
  description,
  icon,
  category,
  is_core,
  sort_order,
  is_available,
  monthly_cost_cents,
  updated_at
)
values (
  'web_traffic',
  'Visite sito',
  'Analytics Intelligence condivisa con Santaddeo: visite, sorgenti, comportamento, domanda e conversioni del sito.',
  'bar-chart-3',
  'addon',
  false,
  330,
  true,
  null,
  now()
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  is_core = excluded.is_core,
  sort_order = excluded.sort_order,
  is_available = excluded.is_available,
  updated_at = now();
