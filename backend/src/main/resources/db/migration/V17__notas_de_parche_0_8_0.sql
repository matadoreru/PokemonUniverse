-- Notas de parche 0.8.0: Pokédex Absurda, Traductor Unown y ¿Quién soy? (11 de noviembre de 2026), escritas para los
-- jugadores a partir del historial de git desde la 0.7.1. Se insertan ya publicadas; si la versión ya existe (escrita a
-- mano desde Administración), se respeta la que hay. "highlight" solo aparece cuando es true, como lo guarda
-- ChangelogChange.
--
-- V15 pasó la 0.8.0 de V14 («El reto diario») a 0.7.1 solo si no había ya una 0.7.1. En una BD que la tuviera, la
-- 0.8.0 de V14 sigue ahí y taparía estas notas (ON CONFLICT no haría nada). Esa fila, y solo esa (versión 0.8.0 con el
-- título y la fecha de V14), se aparta a una versión propia y se despublica: no se borra nada y Administración puede
-- recuperarla.
UPDATE public."Changelog"
SET version = '0.7.1-reto-diario', published = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE version = '0.8.0'
  AND title = 'El reto diario'
  AND date = TIMESTAMP '2026-11-07 12:00:00'
  AND NOT EXISTS (SELECT 1 FROM public."Changelog" WHERE version = '0.7.1-reto-diario');

INSERT INTO public."Changelog" (id, version, title, summary, date, published, content, "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, '0.8.0', 'Tres minijuegos nuevos',
     'Llegan Pokédex Absurda, Traductor Unown y ¿Quién soy?, y saltar un minijuego en la sesión por orden ya no se lleva por delante sus otros modos.',
     TIMESTAMP '2026-11-11 12:00:00', true,
     $json$[
       {"type": "NEW", "text": "Pokédex Absurda: en cada ronda sale un Pokémon y cada jugador escribe en secreto una entrada de Pokédex inventada; luego se vota sin saber de quién es cada una. En Clásico gana la más disparatada. En «¿Cuál es la real?» la entrada oficial se cuela entre las vuestras: hay que descubrirla y conseguir que voten la tuya. De 3 a 8 jugadores.", "highlight": true},
       {"type": "NEW", "text": "Traductor Unown: descifra nombres de Pokémon (modo Pokémon) o de movimientos (modo Movimientos) escritos con glifos Unown. Cada partida baraja qué glifo es cada letra, así que hay que deducirlo. Cada pocos segundos se revela una letra para todos, y las letras descubiertas se quedan para las rondas siguientes. Cuantas menos letras necesites ver, más puntos. De 1 a 8 jugadores.", "highlight": true},
       {"type": "NEW", "text": "¿Quién soy?: todos ven tu Pokémon menos tú. En tu turno haces una pregunta de sí o no y los demás responden con botones (Sí, No, A medias, No lo sé); después puedes intentar adivinar o pasar. Cuantas menos preguntas necesites, más puntos. Un corte de conexión de unos segundos no te hace perder el turno. De 2 a 8 jugadores.", "highlight": true},
       {"type": "MINIGAMES", "text": "Formas regionales: las formas de Alola, Galar, Hisui y Paldea solo salen si también está marcada la generación de su región (por ejemplo, el Vulpix de Alola necesita la 7.ª generación)."},
       {"type": "INTERFACE", "text": "Sketchmon: quien dibuja ve un cursor con el color y el grosor del pincel que tiene elegido."},
       {"type": "IMPROVEMENTS", "text": "El buscador de Pokémon carga más rápido."},
       {"type": "BUGS", "text": "Sesión por orden: saltar un minijuego solo salta el modo que se está jugando; los demás modos de ese minijuego siguen en la cola."}
     ]$json$::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
