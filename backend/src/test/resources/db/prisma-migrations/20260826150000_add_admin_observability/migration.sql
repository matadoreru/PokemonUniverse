CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "RoomHistoryStatus" AS ENUM ('ACTIVE', 'CLOSED', 'INTERRUPTED');
CREATE TYPE "GameHistoryStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INTERRUPTED');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "RoomHistory" (
  "id" TEXT NOT NULL,
  "roomCode" TEXT NOT NULL,
  "hostUserId" TEXT,
  "hostDisplayName" TEXT NOT NULL,
  "maxPlayers" INTEGER NOT NULL,
  "status" "RoomHistoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "closeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoomHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GameHistory"
  ADD COLUMN "roomHistoryId" TEXT,
  ADD COLUMN "status" "GameHistoryStatus" NOT NULL DEFAULT 'COMPLETED',
  ALTER COLUMN "endedAt" DROP NOT NULL,
  ALTER COLUMN "endedAt" DROP DEFAULT;

ALTER TABLE "GameHistory"
  ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

CREATE INDEX "RoomHistory_status_createdAt_idx" ON "RoomHistory"("status", "createdAt");
CREATE INDEX "RoomHistory_roomCode_createdAt_idx" ON "RoomHistory"("roomCode", "createdAt");
CREATE INDEX "RoomHistory_hostUserId_idx" ON "RoomHistory"("hostUserId");
CREATE INDEX "GameHistory_status_startedAt_idx" ON "GameHistory"("status", "startedAt");
CREATE INDEX "GameHistory_roomHistoryId_idx" ON "GameHistory"("roomHistoryId");

ALTER TABLE "RoomHistory"
  ADD CONSTRAINT "RoomHistory_hostUserId_fkey"
  FOREIGN KEY ("hostUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GameHistory"
  ADD CONSTRAINT "GameHistory_roomHistoryId_fkey"
  FOREIGN KEY ("roomHistoryId") REFERENCES "RoomHistory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
