-- Reto diario: un reto por día (el juego y la lista de Pokémon son los mismos para todos) y un intento por cuenta y día.
-- V8–V12 ya están aplicadas en main; si otra migración llega antes que esta, se renumera (Flyway no admite orden distinto).
CREATE TABLE public."DailyChallenge" (
    date date NOT NULL,
    "gameId" text NOT NULL,
    "pokemonIds" jsonb NOT NULL,
    "catalogFingerprint" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY (date),
    CONSTRAINT "DailyChallenge_gameId_check"
        CHECK ("gameId" IN ('pokedex-distance', 'shiny-vote', 'higher-lower', 'learnset-guess'))
);

CREATE TABLE public."DailyResult" (
    id text NOT NULL,
    "userId" text NOT NULL,
    date date NOT NULL,
    "gameId" text NOT NULL,
    status text NOT NULL,
    score integer,
    correct integer,
    rounds jsonb,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    CONSTRAINT "DailyResult_pkey" PRIMARY KEY (id),
    CONSTRAINT "DailyResult_gameId_check"
        CHECK ("gameId" IN ('pokedex-distance', 'shiny-vote', 'higher-lower', 'learnset-guess')),
    CONSTRAINT "DailyResult_status_check" CHECK (status IN ('STARTED', 'FINISHED', 'ABANDONED')),
    -- La puntuación, los aciertos y las rondas solo existen en un resultado terminado.
    CONSTRAINT "DailyResult_score_check" CHECK (
        (status = 'FINISHED' AND score IS NOT NULL AND correct IS NOT NULL AND rounds IS NOT NULL)
        OR (status <> 'FINISHED' AND score IS NULL AND correct IS NULL AND rounds IS NULL)),
    CONSTRAINT "DailyResult_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "DailyResult_date_fkey" FOREIGN KEY (date)
        REFERENCES public."DailyChallenge"(date) ON UPDATE CASCADE
);

-- Un intento por cuenta y día.
CREATE UNIQUE INDEX "DailyResult_userId_date_key" ON public."DailyResult" ("userId", date);
-- Clasificación del día.
CREATE INDEX "DailyResult_date_status_score_finishedAt_idx"
    ON public."DailyResult" (date, status, score DESC, "finishedAt");
