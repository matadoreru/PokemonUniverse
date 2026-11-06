-- Logros desbloqueados por cuenta. Se insertan con ON CONFLICT DO NOTHING; borrar la cuenta borra sus logros.
CREATE TABLE public."UserAchievement" (
    "userId" text NOT NULL,
    "achievementId" text NOT NULL,
    "unlockedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId", "achievementId"),
    CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);
