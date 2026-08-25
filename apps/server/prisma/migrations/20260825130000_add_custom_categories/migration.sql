CREATE TABLE "CustomCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "normalizedText" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomCategory_userId_normalizedText_key" ON "CustomCategory"("userId", "normalizedText");
CREATE INDEX "CustomCategory_userId_idx" ON "CustomCategory"("userId");
ALTER TABLE "CustomCategory" ADD CONSTRAINT "CustomCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
