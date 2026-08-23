DROP INDEX IF EXISTS "Pokemon_nationalDexNumber_key";

ALTER TABLE "Pokemon"
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Pokemon_nationalDexNumber_idx" ON "Pokemon"("nationalDexNumber");
