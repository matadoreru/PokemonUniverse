CREATE TABLE "CustomWouldYouRatherPrompt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "optionA" TEXT NOT NULL,
  "optionB" TEXT NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomWouldYouRatherPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomWouldYouRatherPrompt_userId_normalizedKey_key"
  ON "CustomWouldYouRatherPrompt"("userId", "normalizedKey");
CREATE INDEX "CustomWouldYouRatherPrompt_userId_idx"
  ON "CustomWouldYouRatherPrompt"("userId");

ALTER TABLE "CustomWouldYouRatherPrompt"
  ADD CONSTRAINT "CustomWouldYouRatherPrompt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
