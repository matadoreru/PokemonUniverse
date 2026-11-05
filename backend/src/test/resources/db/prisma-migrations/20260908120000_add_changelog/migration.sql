CREATE TABLE "Changelog" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Changelog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Changelog_version_key" ON "Changelog"("version");
CREATE INDEX "Changelog_published_date_idx" ON "Changelog"("published", "date");
