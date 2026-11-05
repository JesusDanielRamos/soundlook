-- Sesiones de "Transcripción en vivo" guardadas por curso: el docente inicia
-- una sesión, cada frase final reconocida por el navegador se inserta como
-- una línea, y Supabase Realtime transmite esas filas a todos los alumnos
-- que tengan la sesión abierta. Al terminar, la sesión queda como registro
-- (título editable + fecha/hora + transcripción completa).
create table public.transcription_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.transcription_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transcription_sessions(id) on delete cascade,
  text text not null,
  said_at timestamptz not null default now(),
  "order" int not null default 0
);

create index transcription_lines_session_order_idx
  on public.transcription_lines (session_id, "order");

alter table public.transcription_sessions enable row level security;
alter table public.transcription_lines enable row level security;

-- Cualquier usuario autenticado puede leer (alumno, docente o
-- administrador) — es una herramienta de accesibilidad para todo el curso,
-- sin estado "borrador" como el resto del contenido.
create policy "transcription_sessions_select_authenticated"
on public.transcription_sessions for select
using (auth.uid() is not null);

create policy "transcription_sessions_write_staff"
on public.transcription_sessions for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

create policy "transcription_lines_select_authenticated"
on public.transcription_lines for select
using (auth.uid() is not null);

create policy "transcription_lines_write_staff"
on public.transcription_lines for all
using (public.current_user_role() in ('docente', 'administrador'))
with check (public.current_user_role() in ('docente', 'administrador'));

-- Habilita Realtime (postgres_changes) para que los alumnos reciban cada
-- línea nueva y el cambio de estado ("live" -> "ended") al instante.
alter publication supabase_realtime add table public.transcription_sessions;
alter publication supabase_realtime add table public.transcription_lines;
