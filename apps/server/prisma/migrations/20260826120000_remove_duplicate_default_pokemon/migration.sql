-- Older catalog seeds used the species slug as the primary key. PokéAPI uses
-- a form-qualified slug for some default Pokémon (for example,
-- dudunsparce-two-segment), which left two default rows for the same species
-- after the seeding strategy changed. Keep the most recently synchronized row;
-- dependent stale learnsets and Pokédex entries are removed by their cascades.
WITH "rankedDefaults" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "nationalDexNumber"
      ORDER BY "updatedAt" DESC, "id" ASC
    ) AS "position"
  FROM "Pokemon"
  WHERE "isDefault" = TRUE
)
DELETE FROM "Pokemon"
WHERE "id" IN (
  SELECT "id"
  FROM "rankedDefaults"
  WHERE "position" > 1
);

-- This cosmetic Totem variant was previously accepted by the broad Alola
-- suffix rule and has the same display name as the playable regional form.
DELETE FROM "Pokemon"
WHERE "id" = 'raticate-totem-alola';
