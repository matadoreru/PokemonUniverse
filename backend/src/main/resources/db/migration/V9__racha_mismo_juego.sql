-- Racha de partidas seguidas del mismo minijuego por cuenta (logro «Fiel»): el último juego terminado y cuántas
-- partidas seguidas lleva de él. Se actualiza en la transacción de resultados, sin leer el historial de partidas.
ALTER TABLE public."UserStats"
    ADD COLUMN "lastGameId" text,
    ADD COLUMN "sameGameStreak" integer DEFAULT 0 NOT NULL;
