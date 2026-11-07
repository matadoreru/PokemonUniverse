-- Notas de parche 0.8.0: el reto diario y los modos en la sesión por orden (7 de noviembre de 2026), escritas para
-- los jugadores a partir del historial de git. Se insertan ya publicadas; si la versión ya existe (escrita a mano desde
-- Administración), se respeta la que hay. "highlight" solo aparece cuando es true, como lo guarda ChangelogChange.
INSERT INTO public."Changelog" (id, version, title, summary, date, published, content, "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, '0.8.0', 'El reto diario',
     'Cada día, un reto en solitario igual para todos con su clasificación, y la sesión por orden ya admite varios modos de un mismo minijuego.',
     TIMESTAMP '2026-11-07 12:00:00', true,
     $json$[
       {"type": "NEW", "text": "Reto diario: desde «Jugar», un reto en solitario al día, el mismo para todos. Le toca a uno de cuatro minijuegos (Pokédex Distance, Shiny Quiz, Higher or Lower o Learnset Guess) y solo hay un intento. Al terminar ves tu resultado, la clasificación del día y un texto con emojis para compartir. Solo para cuentas registradas y sin experiencia ni estadísticas.", "highlight": true},
       {"type": "NEW", "text": "Sesión por orden con varios modos: marca varios modos de un minijuego en «Modos que se juegan» y cada uno ocupa su propio turno en la cola (Clásico primero). La carta dice cuántos modos hay en juego.", "highlight": true},
       {"type": "INTERFACE", "text": "El selector de modo es ahora el mismo en las tres formas de sesión: «Modos que se juegan». Cada sala empieza en Clásico."}
     ]$json$::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
