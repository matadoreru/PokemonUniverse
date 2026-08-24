CREATE TABLE "PokedexEntry" (
  "id" TEXT NOT NULL,
  "pokemonId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "version" TEXT NOT NULL,
  "versionLabel" TEXT NOT NULL,
  CONSTRAINT "PokedexEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PokedexEntry_pokemonId_language_version_key"
  ON "PokedexEntry"("pokemonId", "language", "version");
CREATE INDEX "PokedexEntry_pokemonId_language_generation_idx"
  ON "PokedexEntry"("pokemonId", "language", "generation");

ALTER TABLE "PokedexEntry"
  ADD CONSTRAINT "PokedexEntry_pokemonId_fkey"
  FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
