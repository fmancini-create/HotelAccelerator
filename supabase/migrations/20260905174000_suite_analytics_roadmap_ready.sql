update public.platform_product_roadmap
set code_ready = true,
    development_status = 'in_progress',
    note = 'Core code ready on feat/superadmin-suite-analytics: read model, ingest API, SuperAdmin overview/detail and HotelAccelerator page-view collector. Online remains false until production deploy and satellite collectors send verified real events.',
    updated_by_email = 'repo-sync',
    updated_at = now()
where roadmap_key = 'suite-superadmin-analytics';
