-- Historial de Prisma: desde el corte 2D Flyway es el único dueño del esquema y nada lee ya esta tabla (/api/health
-- usa solo flyway_schema_history). Existe solo en las BD creadas por Prisma (producción); en una BD creada por Flyway
-- desde vacía no hay nada que borrar.
DROP TABLE IF EXISTS public."_prisma_migrations";
