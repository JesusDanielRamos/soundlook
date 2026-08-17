-- Soundlook — esquema inicial (fase 0)
-- Roles: estudiante (lectura), docente (CRUD contenido), administrador (CRUD contenido + gestión de usuarios).

-- =========================================================================
-- Tipos
-- =========================================================================
create type public.user_role as enum ('estudiante', 'docente', 'administrador');
create type public.content_status as enum ('draft', 'published');
create type public.media_type as enum ('video', 'audio', 'image', 'subtitle', 'transcript', 'diagram');
create type public.question_type as enum ('single_choice', 'multiple_choice', 'true_false');

-- =========================================================================
-- Perfiles
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'estudiante',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crea automáticamente el perfil (siempre como 'estudiante') al registrarse.
-- Docente/administrador solo se asignan manualmente después (UPDATE por un admin).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'estudiante');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper reutilizable en las policies para no repetir el subselect de rol.
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================================
-- Contenido académico
-- =========================================================================
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  "order" int not null default 0,
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  content_html text,
  "order" int not null default 0,
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  type public.media_type not null,
  storage_path text not null,
  bucket text not null default 'lesson-media',
  language text,
  duration_seconds int,
  alt_text text,
  "order" int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  definition text not null,
  visual_media_id uuid references public.media_resources(id),
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null,
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  type public.question_type not null default 'single_choice',
  "order" int not null default 0
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_text text not null,
  is_correct boolean not null default false,
  "order" int not null default 0
);

-- =========================================================================
-- Progreso del usuario (se registra siempre, sin gate de consentimiento)
-- =========================================================================
create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null default 'started',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  score numeric,
  answers jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.media_resources enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;

-- --- profiles ---
create policy "profiles_select_own_or_admin"
on public.profiles for select
using (id = auth.uid() or public.current_user_role() = 'administrador');

create policy "profiles_update_own_fullname"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_admin_manage_roles"
on public.profiles for update
using (public.current_user_role() = 'administrador')
with check (public.current_user_role() = 'administrador');

-- --- contenido: courses / units / lessons / glossary_terms / quizzes ---
-- (mismo patrón para las 5 tablas: estudiante lee solo published, docente/admin leen y escriben todo)
create policy "courses_select_published_or_staff"
on public.courses for select
using (status = 'published' or public.current_user_role() in ('docente', 'administrador'));
create policy "courses_write_staff"
on public.courses for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "units_select_published_or_staff"
on public.units for select
using (status = 'published' or public.current_user_role() in ('docente', 'administrador'));
create policy "units_write_staff"
on public.units for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "lessons_select_published_or_staff"
on public.lessons for select
using (status = 'published' or public.current_user_role() in ('docente', 'administrador'));
create policy "lessons_write_staff"
on public.lessons for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "glossary_select_published_or_staff"
on public.glossary_terms for select
using (status = 'published' or public.current_user_role() in ('docente', 'administrador'));
create policy "glossary_write_staff"
on public.glossary_terms for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "quizzes_select_published_or_staff"
on public.quizzes for select
using (status = 'published' or public.current_user_role() in ('docente', 'administrador'));
create policy "quizzes_write_staff"
on public.quizzes for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

-- --- media_resources / quiz_questions / quiz_answers: sin status propio, heredan del padre ---
create policy "media_select_published_or_staff"
on public.media_resources for select
using (
  public.current_user_role() in ('docente', 'administrador')
  or exists (
    select 1 from public.lessons l
    where l.id = media_resources.lesson_id and l.status = 'published'
  )
);
create policy "media_write_staff"
on public.media_resources for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "quiz_questions_select_published_or_staff"
on public.quiz_questions for select
using (
  public.current_user_role() in ('docente', 'administrador')
  or exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id and q.status = 'published'
  )
);
create policy "quiz_questions_write_staff"
on public.quiz_questions for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "quiz_answers_select_published_or_staff"
on public.quiz_answers for select
using (
  public.current_user_role() in ('docente', 'administrador')
  or exists (
    select 1 from public.quiz_questions qq
    join public.quizzes q on q.id = qq.quiz_id
    where qq.id = quiz_answers.question_id and q.status = 'published'
  )
);
create policy "quiz_answers_write_staff"
on public.quiz_answers for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

-- --- progreso: cada usuario lee/escribe solo lo propio; docente/admin pueden leer todo ---
create policy "lesson_progress_own_or_staff_read"
on public.lesson_progress for select
using (user_id = auth.uid() or public.current_user_role() in ('docente', 'administrador'));
create policy "lesson_progress_own_write"
on public.lesson_progress for insert
with check (user_id = auth.uid());
create policy "lesson_progress_own_update"
on public.lesson_progress for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "quiz_attempts_own_or_staff_read"
on public.quiz_attempts for select
using (user_id = auth.uid() or public.current_user_role() in ('docente', 'administrador'));
create policy "quiz_attempts_own_write"
on public.quiz_attempts for insert
with check (user_id = auth.uid());
