-- Expand the existing private support bucket so HotelAccelerator can stage
-- outbound WhatsApp media before sending it through Meta.
-- Keep all previously supported MIME types and add the WhatsApp image/video/audio/document set.
update storage.buckets
set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/3gpp',
    'audio/aac','audio/mp4','audio/mpeg','audio/amr','audio/ogg',
    'application/pdf','text/plain','text/csv','application/json',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
where id = 'support-private';
