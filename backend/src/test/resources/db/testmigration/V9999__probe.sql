-- Sonda solo de test (FlywayMigrationsTest): una migración posterior a V1 que nunca llega a src/main. Comprueba que
-- una BD creada por Flyway y otra creada por Prisma (baseline 1) convergen tras las migraciones siguientes.
-- Versión 9999 para no chocar con las V2__… reales.
CREATE TABLE "FlywayProbe" (id integer PRIMARY KEY, "userId" text REFERENCES "User"(id));
ALTER TABLE "User" ADD COLUMN "flywayProbe" text;
