create index if not exists crm_apollo_prospects_preferred_email_channel_idx
  on public.crm_apollo_prospects(preferred_email_channel_id)
  where preferred_email_channel_id is not null;

create index if not exists crm_sales_activities_contact_idx
  on public.crm_sales_activities(contact_id)
  where contact_id is not null;

create index if not exists crm_sales_activities_created_by_idx
  on public.crm_sales_activities(created_by)
  where created_by is not null;
