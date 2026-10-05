-- Imagen de portada opcional para courses y units — mismo patrón que
-- glossary-media y lesson-media: bucket público de lectura, escritura solo
-- para docente/administrador.
alter table public.courses add column image_path text;
alter table public.units add column image_path text;

insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', true)
on conflict (id) do nothing;

create policy "course_media_public_read"
on storage.objects for select
using (bucket_id = 'course-media');

create policy "course_media_staff_insert"
on storage.objects for insert
with check (
  bucket_id = 'course-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "course_media_staff_update"
on storage.objects for update
using (
  bucket_id = 'course-media'
  and public.current_user_role() in ('docente', 'administrador')
)
with check (
  bucket_id = 'course-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "course_media_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'course-media'
  and public.current_user_role() in ('docente', 'administrador')
);
