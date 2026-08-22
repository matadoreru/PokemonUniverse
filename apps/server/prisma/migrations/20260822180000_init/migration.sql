CREATE TABLE "User" (
  "id" TEXT NOT NULL, "username" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "avatarSeed" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "UserStats" (
  "userId" TEXT NOT NULL, "gamesPlayed" INTEGER NOT NULL DEFAULT 0, "gamesWon" INTEGER NOT NULL DEFAULT 0,
  "totalPoints" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "UserStats_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "UserGameStats" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "gameId" TEXT NOT NULL, "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
  "gamesWon" INTEGER NOT NULL DEFAULT 0, "metrics" JSONB NOT NULL, CONSTRAINT "UserGameStats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserGameStats_userId_gameId_key" ON "UserGameStats"("userId", "gameId");
CREATE INDEX "UserGameStats_gameId_idx" ON "UserGameStats"("gameId");
CREATE TABLE "GameHistory" (
  "id" TEXT NOT NULL, "roomCode" TEXT NOT NULL, "gameId" TEXT NOT NULL, "playerCount" INTEGER NOT NULL,
  "config" JSONB NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL, "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GameHistory_gameId_endedAt_idx" ON "GameHistory"("gameId", "endedAt");
CREATE TABLE "PlayerGameResult" (
  "id" TEXT NOT NULL, "historyId" TEXT NOT NULL, "userId" TEXT, "displayName" TEXT NOT NULL,
  "position" INTEGER NOT NULL, "points" INTEGER NOT NULL, "metrics" JSONB NOT NULL,
  CONSTRAINT "PlayerGameResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlayerGameResult_userId_idx" ON "PlayerGameResult"("userId");
CREATE TABLE "Pokemon" (
  "id" TEXT NOT NULL, "nationalDexNumber" INTEGER NOT NULL, "name" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "sprite" TEXT NOT NULL, "names" JSONB, "types" TEXT[], "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pokemon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Pokemon_nationalDexNumber_key" ON "Pokemon"("nationalDexNumber");
CREATE INDEX "Pokemon_generation_idx" ON "Pokemon"("generation");
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGameStats" ADD CONSTRAINT "UserGameStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerGameResult" ADD CONSTRAINT "PlayerGameResult_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "GameHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerGameResult" ADD CONSTRAINT "PlayerGameResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
