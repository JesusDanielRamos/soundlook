-- Duración estimada de una lección (en minutos), usada en la vista de
-- unidad para mostrar "~N min estimados" y el tiempo por lección.
alter table public.lessons
  add column estimated_minutes int;
