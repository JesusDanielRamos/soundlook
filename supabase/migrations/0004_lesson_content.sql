-- Contenido enriquecido de una lección: video embebido, recurso visual,
-- transcripción, y las secciones tipo accordion ("Contenido de la lección").

alter table public.lessons
  add column video_url text,
  add column transcript text,
  add column visual_image_path text,
  add column visual_link_url text;

create table public.lesson_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  content text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lesson_sections enable row level security;

-- Mismo patrón que el resto del contenido: estudiante lee solo si la lección
-- dueña está publicada; docente/admin leen y escriben todo.
create policy "lesson_sections_select_published_or_staff"
on public.lesson_sections for select
using (
  public.current_user_role() in ('docente', 'administrador')
  or exists (
    select 1 from public.lessons l
    where l.id = lesson_sections.lesson_id and l.status = 'published'
  )
);

create policy "lesson_sections_write_staff"
on public.lesson_sections for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

-- Bucket público para el "recurso visual" (diagrama) de cada lección —
-- mismo patrón que glossary-media, el nombre ya estaba anticipado como
-- default en media_resources.bucket.
insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', true)
on conflict (id) do nothing;

create policy "lesson_media_public_read"
on storage.objects for select
using (bucket_id = 'lesson-media');

create policy "lesson_media_staff_insert"
on storage.objects for insert
with check (
  bucket_id = 'lesson-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "lesson_media_staff_update"
on storage.objects for update
using (
  bucket_id = 'lesson-media'
  and public.current_user_role() in ('docente', 'administrador')
)
with check (
  bucket_id = 'lesson-media'
  and public.current_user_role() in ('docente', 'administrador')
);

create policy "lesson_media_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'lesson-media'
  and public.current_user_role() in ('docente', 'administrador')
);
