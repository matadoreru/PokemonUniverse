ALTER TABLE "User"
ADD COLUMN "avatarType" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN "avatarValue" TEXT,
ADD COLUMN "avatarVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UserGameStats"
ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserGameStats" AS stats
SET "points" = totals."points"
FROM (
  SELECT results."userId", history."gameId", COALESCE(SUM(results."points"), 0)::INTEGER AS "points"
  FROM "PlayerGameResult" AS results
  JOIN "GameHistory" AS history ON history."id" = results."historyId"
  WHERE results."userId" IS NOT NULL
  GROUP BY results."userId", history."gameId"
) AS totals
WHERE stats."userId" = totals."userId" AND stats."gameId" = totals."gameId";

ALTER TABLE "GameHistory" ADD COLUMN "resultId" TEXT;
UPDATE "GameHistory" SET "resultId" = "id" WHERE "resultId" IS NULL;
ALTER TABLE "GameHistory" ALTER COLUMN "resultId" SET NOT NULL;
CREATE UNIQUE INDEX "GameHistory_resultId_key" ON "GameHistory"("resultId");
