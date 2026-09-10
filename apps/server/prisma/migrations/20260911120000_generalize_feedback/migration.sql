-- Existing feedback was always associated with a minigame. New submissions default to general feedback.
CREATE TYPE "FeedbackReference" AS ENUM ('GENERAL', 'MINIGAME', 'ROOMS', 'ACCOUNT', 'INTERFACE', 'CHANGELOG', 'OTHER');

ALTER TABLE "Feedback"
ADD COLUMN "reference" "FeedbackReference" NOT NULL DEFAULT 'MINIGAME',
ALTER COLUMN "gameId" DROP NOT NULL;

ALTER TABLE "Feedback"
ALTER COLUMN "reference" SET DEFAULT 'GENERAL';
