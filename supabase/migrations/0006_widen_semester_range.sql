-- El select de semestre en el front ahora llega hasta 12vo (antes el check
-- solo permitía 1-9), y el signup fallaba silenciosamente al insertar en
-- profiles vía el trigger handle_new_user. NULL sigue siendo válido (se usa
-- para la opción "Otro" del front).
alter table public.profiles drop constraint if exists profiles_semester_check;
alter table public.profiles add constraint profiles_semester_check
  check (semester is null or semester between 1 and 12);
