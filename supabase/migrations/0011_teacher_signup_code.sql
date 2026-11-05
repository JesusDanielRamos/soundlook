-- Permite que alguien se registre directamente como 'docente' si manda el
-- código de invitación correcto en el metadata del signUp (raw_user_meta_data
-- ->> 'teacher_code'). La comparación ocurre aquí, en el trigger (server-side,
-- security definer) — el código NUNCA se compara en el cliente, así que no
-- queda expuesto en el bundle de Angular aunque alguien lo inspeccione.
--
-- Para cambiar el código: vuelve a correr este CREATE OR REPLACE FUNCTION
-- (p. ej. desde el SQL Editor de Supabase) con el nuevo valor en vez de
-- 'SOUNDLOOK-DOCENTE-2026'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_teacher_code constant text := 'SOUNDLOOK-DOCENTE-2026';
  v_submitted_code text := nullif(trim(new.raw_user_meta_data ->> 'teacher_code'), '');
  v_role public.user_role := 'estudiante';
begin
  -- Si mandaron un código (el campo "¿Eres profesor?" estaba abierto) pero no
  -- coincide, se rechaza el registro entero en vez de crear la cuenta
  -- silenciosamente como estudiante — así el usuario se entera de que se
  -- equivocó de código.
  if v_submitted_code is not null then
    if v_submitted_code = v_teacher_code then
      v_role := 'docente';
    else
      raise exception 'Código de docente inválido.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles (id, full_name, role, semester, has_disability, disability_description)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    v_role,
    (new.raw_user_meta_data ->> 'semester')::smallint,
    coalesce((new.raw_user_meta_data ->> 'has_disability')::boolean, false),
    new.raw_user_meta_data ->> 'disability_description'
  );
  return new;
end;
$$;
