-- Las notas que V14 insertó como 0.8.0 pasan a ser la 0.7.1 (decisión del usuario, 2026-11-07). V14 ya está aplicada
-- en PRE y no se edita: se renombra la versión aquí. Solo si no existe ya una 0.7.1 (escrita a mano desde
-- Administración), para no chocar con el índice único de "version".
UPDATE public."Changelog"
SET version = '0.7.1', "updatedAt" = CURRENT_TIMESTAMP
WHERE version = '0.8.0'
  AND NOT EXISTS (SELECT 1 FROM public."Changelog" WHERE version = '0.7.1');
