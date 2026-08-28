# Minigames Batch Progress

| Minijuego | Estado |
| --- | --- |
| Adivina el Grito | COMPLETED |
| Música de los Pueblos | BLOCKED_DATA |
| Equipo del Líder de Gimnasio | BLOCKED_DATA |
| Huella Pokémon — PMD | BLOCKED_DATA |
| Adivina por la Paleta | IN_PROGRESS |
| Pokémon Trivia | COMPLETED |
| Bomba de Iniciales Pokémon | PENDING |

## Adivina el Grito ✅

Status: COMPLETED

Game ID: `pokemon-cry-quiz`

Implemented:

- Engine determinista, configuración Zod, puntuación por rapidez/orden, cooldown, rondas, reveal y resultados.
- Integración autoritativa con salas, timers, espectadores, desconexión y reconnect.
- Pantallas responsive de lobby, audio, búsqueda, reveal y clasificación final.
- Recurso de audio opaco: el estado Socket.IO nunca contiene el Pokémon objetivo ni la URL de origen.

Main files:

- `packages/shared/src/games/pokemon-cry-quiz/`
- `apps/server/src/pokemon/audio-assets.ts`
- `apps/web/src/games/pokemon-cry-quiz/ConfigPanel.tsx`
- `apps/web/src/room/PokemonCryQuizGame.tsx`
- `apps/web/src/room/PokemonCryQuizResults.tsx`

Data:

- Referencias `CRY_LATEST` y `CRY_LEGACY` existentes en `PokemonAssetReference`, cargadas desde PostgreSQL.
- No se realizan consultas runtime a PokéAPI y no se exponen URLs de origen al navegador.

Migrations: ninguna; se reutiliza el modelo aditivo existente.

Tests:

- Selección y versiones de grito, privacidad/reconnect, intentos, cooldown, puntuación, timeout, desconexión, rondas, ranking, catálogo local, integración de sala y presentación web.

Verification:

- typecheck ✅
- lint ✅
- tests ✅ — 612 tests
- build ✅

Limitations:

- Una versión concreta solo está disponible si DataSync ha persistido su referencia oficial. El juego excluye automáticamente Pokémon sin el grito solicitado.

Next: Música de los Pueblos (`BLOCKED_DATA`).

## Música de los Pueblos — bloqueado por datos

Status: BLOCKED_DATA

Game ID: pendiente de implementación.

Repository audit:

- PostgreSQL no contiene un catálogo de localizaciones ni pistas musicales.
- `PokemonGeneration.mainRegion` únicamente identifica la región principal y no permite construir preguntas o validar respuestas.
- `PokemonAssetReference` y DataSync solo gestionan sprites, artworks y gritos Pokémon; no existe un tipo de asset musical.
- No hay archivos de audio, manifiestos de pistas o metadatos de licencia en el repositorio.

Required data:

- Un catálogo autorizado que relacione cada pista con una localización, región, generación y respuestas aceptadas.
- Archivos locales o referencias estables que DataSync pueda persistir y servir desde la aplicación sin consultas runtime externas.
- Procedencia y licencia de uso de las grabaciones.

Safety decision:

- No se ha creado engine, UI, migración ni contenido de prueba permanente para evitar dejar un minijuego parcial o introducir música sin procedencia.
- Adivina el Grito permanece completamente funcional y verificado.

Verification: no requerida; el checkpoint solo documenta la ausencia del dataset.

## Equipo del Líder de Gimnasio — bloqueado por datos

Status: BLOCKED_DATA

Game ID: pendiente de implementación.

Repository audit:

- PostgreSQL no contiene líderes, gimnasios, combates ni composiciones de equipos.
- El catálogo Pokémon permite validar especies, tipos y estadísticas, pero no atribuir un Pokémon a un equipo oficial concreto.
- No existe un manifiesto que defina juego/versión, revancha, nivel o variante de cada equipo.

Required data:

- Catálogo autorizado y versionado de líderes con región, gimnasio y uno o varios equipos oficiales.
- Decisión de contenido sobre qué variantes cuentan cuando un líder tiene equipos diferentes por versión, dificultad o revancha.

Safety decision:

- No se han inventado equipos ni creado una UI apoyada en mocks permanentes.

## Huella Pokémon — PMD — bloqueado por datos

Status: BLOCKED_DATA

Repository audit:

- Prisma define `PokemonSpecies.footprintUrl`, pero el seed y `PokemonDataSync` nunca lo escriben.
- El repositorio no contiene archivos de huellas ni un manifiesto PMD.
- Un esquema vacío no constituye un dataset jugable y no se utilizarán URLs inventadas.

Required data:

- Dataset autorizado de huellas asociado a especies y con cobertura conocida por generación.
- Procedencia/licencia y estrategia de persistencia mediante DataSync.

## Pokémon Trivia ✅

Status: COMPLETED

Game ID: `pokemon-trivia`

Implemented:

- Engine determinista con preguntas de tipos, generaciones, BST, velocidad, altura y peso.
- Tres o cuatro opciones, respuesta única, puntuación por precisión/rapidez, reveal de cuatro segundos y ranking final.
- Timers, timeout, desconexión, reconnect, espectadores y finalización temprana autoritativos.
- Configuración de lobby para generaciones, categorías, opciones, tiempo y número de preguntas.
- UI responsive de pregunta, opciones visuales, estado de participantes, reveal y resultados.
- Respuesta correcta, explicación y elecciones rivales privadas hasta el reveal.

Main files:

- `packages/shared/src/games/pokemon-trivia/`
- `apps/web/src/games/pokemon-trivia/ConfigPanel.tsx`
- `apps/web/src/room/PokemonTriviaGame.tsx`
- `apps/web/src/room/PokemonTriviaResults.tsx`

Data:

- Catálogo Pokémon local de PostgreSQL: generaciones, tipos, estadísticas, medidas, colores y clasificación legendaria/mítica.
- El juego actual utiliza formas canónicas con sprite, sin consultas runtime a APIs externas.

Migrations: ninguna.

Tests:

- Generación de las seis categorías, límites de configuración y pools válidos.
- Privacidad en estado público, Socket.IO y reconnect.
- Respuesta única, espectador, timeout, desconexión, respuesta tardía, puntuación, reveal, rondas y ranking.
- Configuración, pantalla activa, ausencia de filtraciones y resultados web.

Verification:

- typecheck ✅
- lint ✅
- tests ✅ — 622 tests (server 118, web 121, shared 383)
- build ✅

Limitations:

- Las preguntas se limitan a hechos objetivos presentes en el catálogo actual; no se incluyen preguntas narrativas o de juegos/anime sin un dataset autorizado.
- Una configuración formada únicamente por preguntas de generación exige seleccionar al menos dos generaciones.

Next: Adivina por la Paleta (`PENDING`).
