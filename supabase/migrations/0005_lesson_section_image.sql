-- Permite que cada sección (accordion) de "Contenido de la lección" tenga
-- una imagen opcional. Reutiliza el bucket lesson-media (ya público, con
-- policies de escritura solo para docente/administrador) creado en 0004.
alter table public.lesson_sections
  add column image_path text;
