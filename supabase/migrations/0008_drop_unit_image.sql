-- Se decidió no usar imagen de portada por unidad, solo por curso.
alter table public.units drop column if exists image_path;
