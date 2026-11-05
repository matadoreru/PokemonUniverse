-- Resumen corto y opcional de cada versión de las novedades (máximo 200 caracteres, lo valida ChangelogInput). Los
-- cambios destacados no necesitan columna: van en el JSON de "content" como "highlight": true.
ALTER TABLE public."Changelog"
    ADD COLUMN summary text;
