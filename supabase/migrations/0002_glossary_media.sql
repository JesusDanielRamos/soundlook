-- Glosario: categoría opcional + imagen (Storage) y link a video.
-- A diferencia de lessons, el glosario no necesita el modelo completo de
-- media_resources (bucket/duración/idioma): solo una imagen subida a Storage
-- y, opcionalmente, un link externo a video.

alter table public.glossary_terms
  add column category text,
  add column image_path text,
  add column video_url text;

-- Bucket público: las imágenes del glosario se sirven vía getPublicUrl(),
-- sin necesitar URLs firmadas (el glosario ya es de lectura pública en RLS).
insert into storage.buckets (id, name, public)
values ('glossary-media', 'glossary-media', true)
on conflict (id) do nothing;

create policy "glossary_media_public_read"
on storage.objects for select
using (bucket_id = 'glossary-media');

create policy "glossary_media_staff_insert"
on storage.objects for insert
with check (
  bucket_id = 'glossary-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "glossary_media_staff_update"
on storage.objects for update
using (
  bucket_id = 'glossary-media'
  and public.current_user_role() in ('docente', 'administrador')
)
with check (
  bucket_id = 'glossary-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "glossary_media_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'glossary-media'
  and public.current_user_role() in ('docente', 'administrador')
);
