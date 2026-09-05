-- Private storage for screenshots/files attached to internal bug/improvement reports.
-- Applied to production on 2026-09-05 via Supabase migration support_feedback_private_storage.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'support-private',
  'support-private',
  false,
  10485760,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'application/pdf','text/plain','text/csv','application/json',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
