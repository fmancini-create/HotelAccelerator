revoke all on table public.crm_operator_sales_attribution_audit from service_role;
grant select, insert on table public.crm_operator_sales_attribution_audit to service_role;

revoke truncate, references, trigger on table public.crm_operator_sales_attributions from service_role;
grant select, insert, update, delete on table public.crm_operator_sales_attributions to service_role;
