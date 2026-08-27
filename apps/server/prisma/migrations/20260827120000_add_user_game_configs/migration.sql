CREATE TABLE "UserGameConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserGameConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserGameConfig_userId_gameId_key" ON "UserGameConfig"("userId", "gameId");
CREATE INDEX "UserGameConfig_gameId_idx" ON "UserGameConfig"("gameId");

ALTER TABLE "UserGameConfig"
  ADD CONSTRAINT "UserGameConfig_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
