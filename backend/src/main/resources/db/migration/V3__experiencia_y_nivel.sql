-- Experiencia de las cuentas registradas; el nivel se deriva de ella en Java (domain/progression/Experience).
ALTER TABLE public."UserStats"
    ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;

-- Las partidas ya terminadas cuentan con la misma tabla que Experience.xpForGame: 20 por jugar y, con al menos dos
-- jugadores, 30/20/10 por quedar primero, segundo o tercero. El número de jugadores son las filas de resultado de esa
-- partida. Las partidas abandonadas, saltadas o interrumpidas no dan experiencia.
UPDATE public."UserStats" AS s
SET "xp" = t.xp
FROM (
    SELECT r."userId",
           LEAST(SUM(20 + CASE WHEN r.players >= 2 THEN
                                   CASE r."position" WHEN 1 THEN 30 WHEN 2 THEN 20 WHEN 3 THEN 10 ELSE 0 END
                               ELSE 0 END), 2147483647)::integer AS xp
    FROM (
        SELECT p."userId", p."position", COUNT(*) OVER (PARTITION BY p."historyId") AS players
        FROM public."PlayerGameResult" AS p
        JOIN public."GameHistory" AS h ON h.id = p."historyId"
        WHERE h.status = 'COMPLETED'
    ) AS r
    WHERE r."userId" IS NOT NULL
    GROUP BY r."userId"
) AS t
WHERE s."userId" = t."userId";
