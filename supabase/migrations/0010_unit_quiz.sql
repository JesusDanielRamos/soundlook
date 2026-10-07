-- Permite crear un quiz directamente sobre una unidad (antes un quiz solo
-- podía colgar de una lección) y agrega el tipo de pregunta abierta, que no
-- se autocalifica (se guarda para que el docente la lea, pero no cuenta en
-- el puntaje).
alter table public.quizzes
  add column unit_id uuid references public.units(id) on delete cascade;

alter type public.question_type add value 'open';

-- Un docente (no solo administrador) necesita poder ver el nombre de
-- cualquier alumno para revisar sus calificaciones de quiz. La policy
-- original de profiles solo dejaba ver el propio perfil o, si eras
-- administrador, cualquiera — se agrega una policy adicional (se combinan
-- con OR) para que docente también pueda leer todos los perfiles.
create policy "profiles_select_staff"
on public.profiles for select
using (public.current_user_role() in ('docente', 'administrador'));

-- Califica un intento de quiz en el servidor (para no exponer is_correct de
-- quiz_answers al alumno mientras responde) y guarda el intento.
-- p_answers: jsonb array de { "questionId": uuid, "selectedAnswerIds": uuid[], "text": string }.
-- Las preguntas de tipo 'open' no se toman en cuenta para el puntaje.
create function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_question record;
  v_selected uuid[];
  v_correct_ids uuid[];
  v_total int := 0;
  v_correct int := 0;
  v_score numeric;
begin
  for v_question in
    select id, type from public.quiz_questions where quiz_id = p_quiz_id
  loop
    if v_question.type = 'open' then
      continue;
    end if;

    v_total := v_total + 1;

    select coalesce(array_agg(elem::uuid order by elem), '{}')
      into v_selected
      from jsonb_array_elements_text(
        coalesce(
          (
            select answer -> 'selectedAnswerIds'
            from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as answer
            where (answer ->> 'questionId')::uuid = v_question.id
            limit 1
          ),
          '[]'::jsonb
        )
      ) as elem;

    select coalesce(array_agg(id order by id), '{}')
      into v_correct_ids
      from public.quiz_answers
      where question_id = v_question.id and is_correct = true;

    if v_selected = v_correct_ids then
      v_correct := v_correct + 1;
    end if;
  end loop;

  if v_total = 0 then
    v_score := null;
  else
    v_score := round((v_correct::numeric / v_total) * 100, 1);
  end if;

  insert into public.quiz_attempts (user_id, quiz_id, score, answers)
  values (auth.uid(), p_quiz_id, v_score, coalesce(p_answers, '[]'::jsonb));

  return v_score;
end;
$$;

grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
