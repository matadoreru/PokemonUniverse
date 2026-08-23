ALTER TABLE "Pokemon"
ADD COLUMN "evolutionStage" INTEGER,
ADD COLUMN "evolutionStages" INTEGER;

CREATE TABLE "Move" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "names" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PokemonLevelUpMove" (
  "pokemonId" TEXT NOT NULL,
  "moveId" TEXT NOT NULL,
  "referenceGeneration" INTEGER NOT NULL,
  "level" INTEGER NOT NULL,
  CONSTRAINT "PokemonLevelUpMove_pkey" PRIMARY KEY ("pokemonId", "moveId", "referenceGeneration", "level")
);

CREATE INDEX "PokemonLevelUpMove_pokemonId_referenceGeneration_level_idx"
ON "PokemonLevelUpMove"("pokemonId", "referenceGeneration", "level");
CREATE INDEX "PokemonLevelUpMove_moveId_idx" ON "PokemonLevelUpMove"("moveId");

ALTER TABLE "PokemonLevelUpMove"
ADD CONSTRAINT "PokemonLevelUpMove_pokemonId_fkey"
FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PokemonLevelUpMove"
ADD CONSTRAINT "PokemonLevelUpMove_moveId_fkey"
FOREIGN KEY ("moveId") REFERENCES "Move"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PokemonCatalogSync" (
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PokemonCatalogSync_pkey" PRIMARY KEY ("key")
);
