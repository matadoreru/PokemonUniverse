-- Additive data infrastructure migration. Existing Pokémon and gameplay data
-- are retained; the normalized tables are backfilled from the current catalog.
CREATE TYPE "DataSyncSource" AS ENUM ('POKEAPI', 'TCGDEX');
CREATE TYPE "DataSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "DataSyncMode" AS ENUM ('INITIAL', 'INCREMENTAL', 'FULL', 'PRICE_REFRESH');

ALTER TABLE "Pokemon"
  ADD COLUMN "speciesId" INTEGER,
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "Move"
  ADD COLUMN "power" INTEGER,
  ADD COLUMN "accuracy" INTEGER,
  ADD COLUMN "pp" INTEGER,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generation" INTEGER,
  ADD COLUMN "metadata" JSONB;

CREATE TABLE "PokemonGeneration" (
  "id" INTEGER NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "mainRegion" TEXT,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PokemonGeneration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PokemonGeneration_slug_key" ON "PokemonGeneration"("slug");

INSERT INTO "PokemonGeneration" ("id", "slug", "name", "updatedAt")
SELECT generation, 'generation-' || generation, 'Generación ' || generation, CURRENT_TIMESTAMP
FROM "Pokemon" GROUP BY generation ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "PokemonSpecies" (
  "id" INTEGER NOT NULL, "slug" TEXT NOT NULL, "generationId" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "names" JSONB, "color" TEXT, "shape" TEXT, "habitat" TEXT, "growthRate" TEXT,
  "genderRate" INTEGER, "captureRate" INTEGER, "baseHappiness" INTEGER, "hatchCounter" INTEGER,
  "isBaby" BOOLEAN NOT NULL DEFAULT false, "isLegendary" BOOLEAN NOT NULL DEFAULT false,
  "isMythical" BOOLEAN NOT NULL DEFAULT false, "hasGenderDifferences" BOOLEAN NOT NULL DEFAULT false,
  "formsSwitchable" BOOLEAN NOT NULL DEFAULT false, "evolvesFromSpeciesId" INTEGER,
  "evolutionChainId" INTEGER, "footprintUrl" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PokemonSpecies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PokemonSpecies_slug_key" ON "PokemonSpecies"("slug");
CREATE INDEX "PokemonSpecies_generationId_idx" ON "PokemonSpecies"("generationId");
CREATE INDEX "PokemonSpecies_evolutionChainId_idx" ON "PokemonSpecies"("evolutionChainId");
ALTER TABLE "PokemonSpecies" ADD CONSTRAINT "PokemonSpecies_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "PokemonGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PokemonSpecies" ("id", "slug", "generationId", "name", "names", "color", "isLegendary", "isMythical", "createdAt", "updatedAt")
SELECT DISTINCT ON ("nationalDexNumber") "nationalDexNumber", "id", "generation", "name", "names", NULLIF("color", 'unknown'),
  "legendaryStatus" = 'LEGENDARY', "legendaryStatus" = 'MYTHICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Pokemon" ORDER BY "nationalDexNumber", "isDefault" DESC, "updatedAt" DESC;
UPDATE "Pokemon" SET "speciesId" = "nationalDexNumber" WHERE "speciesId" IS NULL;
CREATE INDEX "Pokemon_speciesId_idx" ON "Pokemon"("speciesId");
ALTER TABLE "Pokemon" ADD CONSTRAINT "Pokemon_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PokemonSpecies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PokemonPokedexNumber" (
  "speciesId" INTEGER NOT NULL, "pokedex" TEXT NOT NULL, "entryNumber" INTEGER NOT NULL,
  CONSTRAINT "PokemonPokedexNumber_pkey" PRIMARY KEY ("speciesId", "pokedex")
);
CREATE INDEX "PokemonPokedexNumber_pokedex_entryNumber_idx" ON "PokemonPokedexNumber"("pokedex", "entryNumber");
ALTER TABLE "PokemonPokedexNumber" ADD CONSTRAINT "PokemonPokedexNumber_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PokemonSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "PokemonPokedexNumber" ("speciesId", "pokedex", "entryNumber") SELECT "id", 'national', "id" FROM "PokemonSpecies" ON CONFLICT DO NOTHING;

CREATE TABLE "PokemonStat" ("pokemonId" TEXT NOT NULL, "stat" TEXT NOT NULL, "baseValue" INTEGER NOT NULL, "effort" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "PokemonStat_pkey" PRIMARY KEY ("pokemonId", "stat"));
CREATE INDEX "PokemonStat_stat_baseValue_idx" ON "PokemonStat"("stat", "baseValue");
ALTER TABLE "PokemonStat" ADD CONSTRAINT "PokemonStat_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "PokemonStat" ("pokemonId", "stat", "baseValue")
SELECT "id", stat, value FROM "Pokemon" CROSS JOIN LATERAL (VALUES ('hp', hp), ('attack', attack), ('defense', defense), ('special-attack', "specialAttack"), ('special-defense', "specialDefense"), ('speed', speed), ('bst', "baseStatTotal")) AS stat_values(stat, value) ON CONFLICT DO NOTHING;

CREATE TABLE "PokemonType" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "names" JSONB, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PokemonType_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PokemonTypeAssignment" ("pokemonId" TEXT NOT NULL, "typeId" TEXT NOT NULL, "slot" INTEGER NOT NULL, CONSTRAINT "PokemonTypeAssignment_pkey" PRIMARY KEY ("pokemonId", "typeId"));
CREATE UNIQUE INDEX "PokemonTypeAssignment_pokemonId_slot_key" ON "PokemonTypeAssignment"("pokemonId", "slot");
CREATE INDEX "PokemonTypeAssignment_typeId_idx" ON "PokemonTypeAssignment"("typeId");
ALTER TABLE "PokemonTypeAssignment" ADD CONSTRAINT "PokemonTypeAssignment_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokemonTypeAssignment" ADD CONSTRAINT "PokemonTypeAssignment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "PokemonType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "PokemonType" ("id", "name", "updatedAt") SELECT DISTINCT type, initcap(type), CURRENT_TIMESTAMP FROM "Pokemon", unnest(types) AS type ON CONFLICT DO NOTHING;
INSERT INTO "PokemonTypeAssignment" ("pokemonId", "typeId", "slot") SELECT "id", type, ordinality::INTEGER FROM "Pokemon", unnest(types) WITH ORDINALITY AS item(type, ordinality) ON CONFLICT DO NOTHING;

CREATE TABLE "Ability" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "names" JSONB, "effect" JSONB, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Ability_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PokemonAbility" ("pokemonId" TEXT NOT NULL, "abilityId" TEXT NOT NULL, "slot" INTEGER NOT NULL, "isHidden" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "PokemonAbility_pkey" PRIMARY KEY ("pokemonId", "abilityId"));
CREATE UNIQUE INDEX "PokemonAbility_pokemonId_slot_key" ON "PokemonAbility"("pokemonId", "slot");
CREATE INDEX "PokemonAbility_abilityId_idx" ON "PokemonAbility"("abilityId");
ALTER TABLE "PokemonAbility" ADD CONSTRAINT "PokemonAbility_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokemonAbility" ADD CONSTRAINT "PokemonAbility_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "Ability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "Ability" ("id", "name", "names", "updatedAt") SELECT DISTINCT lower(regexp_replace(ability, '[^[:alnum:]]+', '-', 'g')), ability, jsonb_build_object('es', ability), CURRENT_TIMESTAMP FROM "Pokemon", unnest(abilities) AS ability ON CONFLICT DO NOTHING;
INSERT INTO "PokemonAbility" ("pokemonId", "abilityId", "slot") SELECT "id", lower(regexp_replace(ability, '[^[:alnum:]]+', '-', 'g')), ordinality::INTEGER FROM "Pokemon", unnest(abilities) WITH ORDINALITY AS item(ability, ordinality) ON CONFLICT DO NOTHING;

CREATE TABLE "PokemonEvolution" ("id" TEXT NOT NULL, "chainId" INTEGER NOT NULL, "fromPokemonId" TEXT NOT NULL, "toPokemonId" TEXT NOT NULL, "trigger" TEXT, "minLevel" INTEGER, "conditions" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PokemonEvolution_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PokemonEvolution_chainId_fromPokemonId_toPokemonId_key" ON "PokemonEvolution"("chainId", "fromPokemonId", "toPokemonId");
CREATE INDEX "PokemonEvolution_fromPokemonId_idx" ON "PokemonEvolution"("fromPokemonId");
CREATE INDEX "PokemonEvolution_toPokemonId_idx" ON "PokemonEvolution"("toPokemonId");
ALTER TABLE "PokemonEvolution" ADD CONSTRAINT "PokemonEvolution_fromPokemonId_fkey" FOREIGN KEY ("fromPokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokemonEvolution" ADD CONSTRAINT "PokemonEvolution_toPokemonId_fkey" FOREIGN KEY ("toPokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PokemonAssetReference" ("id" TEXT NOT NULL, "pokemonId" TEXT NOT NULL, "kind" TEXT NOT NULL, "url" TEXT NOT NULL, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PokemonAssetReference_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PokemonAssetReference_pokemonId_kind_url_key" ON "PokemonAssetReference"("pokemonId", "kind", "url");
CREATE INDEX "PokemonAssetReference_pokemonId_kind_idx" ON "PokemonAssetReference"("pokemonId", "kind");
ALTER TABLE "PokemonAssetReference" ADD CONSTRAINT "PokemonAssetReference_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "PokemonAssetReference" ("id", "pokemonId", "kind", "url", "isPrimary", "updatedAt") SELECT 'sprite:' || "id", "id", 'SPRITE', "sprite", true, CURRENT_TIMESTAMP FROM "Pokemon" ON CONFLICT DO NOTHING;
UPDATE "Pokemon" SET "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('shinySprite', regexp_replace("sprite", '/sprites/pokemon/', '/sprites/pokemon/shiny/')) WHERE "sprite" LIKE '%/sprites/pokemon/%';
INSERT INTO "PokemonAssetReference" ("id", "pokemonId", "kind", "url", "isPrimary", "updatedAt")
SELECT 'shiny-sprite:' || "id", "id", 'SHINY_SPRITE', "metadata"->>'shinySprite', false, CURRENT_TIMESTAMP FROM "Pokemon" WHERE "metadata"->>'shinySprite' IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE "TcgSet" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "series" TEXT, "logoUrl" TEXT, "symbolUrl" TEXT, "releaseDate" TIMESTAMP(3), "cardCount" INTEGER, "metadata" JSONB, "sourceUpdatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TcgSet_pkey" PRIMARY KEY ("id"));
CREATE INDEX "TcgSet_releaseDate_idx" ON "TcgSet"("releaseDate");
CREATE TABLE "TcgCard" ("id" TEXT NOT NULL, "localId" TEXT, "setId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT, "hp" INTEGER, "rarity" TEXT, "imageUrl" TEXT, "illustrator" TEXT, "metadata" JSONB, "sourceUpdatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TcgCard_pkey" PRIMARY KEY ("id"));
CREATE INDEX "TcgCard_setId_idx" ON "TcgCard"("setId"); CREATE INDEX "TcgCard_name_idx" ON "TcgCard"("name"); CREATE INDEX "TcgCard_rarity_idx" ON "TcgCard"("rarity");
ALTER TABLE "TcgCard" ADD CONSTRAINT "TcgCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "TcgSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "TcgCardPokemon" ("cardId" TEXT NOT NULL, "pokemonId" TEXT NOT NULL, CONSTRAINT "TcgCardPokemon_pkey" PRIMARY KEY ("cardId", "pokemonId"));
CREATE INDEX "TcgCardPokemon_pokemonId_idx" ON "TcgCardPokemon"("pokemonId");
ALTER TABLE "TcgCardPokemon" ADD CONSTRAINT "TcgCardPokemon_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TcgCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TcgCardPokemon" ADD CONSTRAINT "TcgCardPokemon_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "TcgCardPrice" ("id" TEXT NOT NULL, "cardId" TEXT NOT NULL, "provider" TEXT NOT NULL, "currency" TEXT NOT NULL, "variant" TEXT NOT NULL, "market" DECIMAL(12,4), "low" DECIMAL(12,4), "mid" DECIMAL(12,4), "high" DECIMAL(12,4), "trend" DECIMAL(12,4), "metadata" JSONB, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TcgCardPrice_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "TcgCardPrice_cardId_provider_currency_variant_key" ON "TcgCardPrice"("cardId", "provider", "currency", "variant"); CREATE INDEX "TcgCardPrice_observedAt_idx" ON "TcgCardPrice"("observedAt");
ALTER TABLE "TcgCardPrice" ADD CONSTRAINT "TcgCardPrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TcgCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataSyncRun" ("id" TEXT NOT NULL, "source" "DataSyncSource" NOT NULL, "mode" "DataSyncMode" NOT NULL, "status" "DataSyncStatus" NOT NULL DEFAULT 'PENDING', "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "durationMs" INTEGER, "recordsProcessed" INTEGER NOT NULL DEFAULT 0, "inserted" INTEGER NOT NULL DEFAULT 0, "updated" INTEGER NOT NULL DEFAULT 0, "skipped" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DataSyncRun_pkey" PRIMARY KEY ("id"));
CREATE INDEX "DataSyncRun_source_createdAt_idx" ON "DataSyncRun"("source", "createdAt"); CREATE INDEX "DataSyncRun_status_idx" ON "DataSyncRun"("status");
CREATE TABLE "DataSyncState" ("source" "DataSyncSource" NOT NULL, "datasetVersion" TEXT, "lastSuccessAt" TIMESTAMP(3), "lastAttemptAt" TIMESTAMP(3), "lastFullSyncAt" TIMESTAMP(3), "recordsAvailable" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT, "metadata" JSONB, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DataSyncState_pkey" PRIMARY KEY ("source"));
