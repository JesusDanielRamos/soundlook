-- Permite agregar un "ejemplo interactivo" (ej. medidor de decibeles) debajo
-- de las lecciones de una unidad. Si interactive_title es null, no se
-- muestra nada para el estudiante.sssdsd
alter table public.units
  add column interactive_title text,
  add column interactive_description text;
