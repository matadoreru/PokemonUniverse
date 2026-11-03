# Pokémon Universe

Colección de minijuegos Pokémon para jugar con amigos desde el navegador. Crea una sala privada, comparte el código y elegid juntos a qué jugar: adivinar siluetas, gritos o entradas de la Pokédex, subastas, dibujo, deducción social y mucho más.

> Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company. Todos los nombres de productos son marcas registradas de sus respectivos dueños.

## Cómo se juega

1. Entra con una cuenta o como invitado (no hace falta registrarse).
2. Crea una sala privada o únete con el código de 6 caracteres de un amigo.
3. El host elige el minijuego y su configuración; el resto se marca como listo.
4. Jugad varias rondas, votad el siguiente juego y consultad los resultados de la sesión.

Las salas admiten hasta 8 jugadores por defecto. Si alguien se desconecta, conserva su sitio durante unos segundos para poder volver.

## Minijuegos

| Juego | Jugadores | De qué va |
|---|---|---|
| 🔊 Adivina el Grito | 1+ | Escucha el grito oficial y descubre qué Pokémon lo hace. |
| 🎨 Adivina por la Paleta | 1+ | Reconoce al Pokémon solo por los colores de su sprite. |
| 📈 Higher or Lower | 1+ | Acierta si la stat de un Pokémon es mayor, menor o igual. |
| 🃏 Higher or Lower: Cartas | 1+ | Compara el precio actual de dos cartas del TCG. |
| 🎉 Pokémon Bingo | 1+ | Completa un tablero de condiciones con Pokémon distintos. |
| 🧩 Pokémon Connections | 1+ | Encuentra los grupos de Pokémon que comparten una conexión. |
| 🧠 Pokémon Trivia | 1+ | Preguntas sobre tipos, generaciones, estadísticas y medidas. |
| ✨ Shiny Quiz | 1+ | Encuentra el shiny verdadero entre varios candidatos. |
| ❓ ¿Quién es ese Pokémon? | 1+ | Reconoce la silueta antes que nadie. |
| 🔎 Zoomed Pokémon | 1+ | Adivina el Pokémon mientras la cámara se aleja. |
| 📊 Guess from Stats | 2+ | Reconoce Pokémon por sus estadísticas base. |
| 📚 Learnset Guess | 2+ | Descubre el Pokémon a medida que se revela su learnset. |
| 🏁 Pokédle Race | 2+ | Descubre tu Pokémon secreto con pistas comparativas. |
| 🎯 Pokédex Distance | 2+ | Elige un Pokémon cuyo número esté lo más cerca del objetivo. |
| 📖 Pokédex Entry Guess | 2+ | Reconoce al Pokémon por una entrada oficial de la Pokédex. |
| 🔨 Pokémon Bluff Auction | 2+ | Puja cuántos Pokémon puedes nombrar y demuéstralo. |
| 💰 Pokémon Team Auction | 2+ | Construye tu equipo pujando en una subasta. |
| 🎙️ PokéTaboo | 2+ | Describe un Pokémon sin decir su nombre. |
| 🃏 Quién es Quién — Pokémon | 2+ | Dos equipos intentan descubrir el Pokémon secreto rival. |
| 🎨 Sketchmon | 2+ | Dibuja un Pokémon en tiempo real para que lo adivinen. |
| ⛓️ Type Chain | 2+ | Encadena Pokémon que compartan exactamente un tipo. |
| ⚔️ Type Duel | 2+ | Corre contra otro entrenador para encontrar una combinación de tipos. |
| 👉 Most Likely To | 3+ | Elige qué Pokémon encaja mejor con una situación. |
| 🕵️ One of Us Is Fake | 3+ | Descubrid quién recibió una categoría secreta diferente. |
| 🕵️ Pokémon Impostor | 3+ | Da pistas y desenmascara a los impostores. |
| 🚩 Pokémon Red Flag / Green Flag | 3+ | Escribe la flag más divertida y gana la votación anónima. |
| 📋 Secret Ranking | 3+ | Ordena cinco Pokémon pensando como el resto del grupo. |
| ⚖️ Would You Rather Pokémon | 3+ | Elige entre dos situaciones y predice qué preferirá la mayoría. |

## Tecnología

- **Monorepo** con npm workspaces y TypeScript estricto.
- **`packages/shared`**: contratos Zod, tipos, puntuación y los motores deterministas de cada minijuego.
- **`apps/server`**: Express, Socket.IO y Prisma sobre PostgreSQL. Es la autoridad de la partida: temporizadores, secretos y ganadores se deciden aquí.
- **`frontend`**: React 19, Vite y Tailwind. Solo muestra lo que el servidor le envía a cada jugador.
- **`backend`**: backend Java 25 con Micronaut, Gradle y PostgreSQL (ver abajo).
- **`e2e`**: pruebas end-to-end con Playwright.

### Backend Java (etapa 1)

El backend Java convive con Node detrás del mismo origen y ambos firman y aceptan la misma cookie `pu_session` con `JWT_SECRET`. En esta etapa Java atiende `POST /api/auth/{register,login,guest,logout}`, `GET /api/auth/{me,profile}`, `GET /api/auth/avatars/*`, `GET /api/changelog`, `POST /api/feedback`, `GET /api/games`, `GET /api/health` y `GET /api/pokemon`. En producción todo lo demás (salas, Socket.IO, administración, TCG, categorías, subida de avatares…) sigue en Node. En contenedores el reparto lo hace nginx; en desarrollo, desde el corte 2D, el proxy de Vite (`frontend/vite.config.ts`) manda ya todo `/api` y `/ws` a Java.

### Salas en Java (etapas 2A y 2B, solo desarrollo)

El backend Java aloja las salas por un WebSocket propio en `/ws`. En el servidor lo controla `pu.rooms.enabled` (`ROOMS_ENABLED`): está activo en el entorno `dev` que usan `npm run dev`/`npm run dev:backend` y en los tests, y apagado por defecto en producción (`/ws` cierra con 4403) hasta el corte 2D. Desde el corte 2D la web usa siempre este `/ws` (la antigua bandera `VITE_REALTIME` ya no existe) y en desarrollo Vite manda todo `/api` y `/ws` a Java.

Los 28 minijuegos están portados y verificados con fixtures doradas contra los motores TypeScript, y Java sirve también las imágenes y gritos de ronda (`/api/rooms/`). **Higher or Lower: Cartas** (`tcg-higher-lower`) y **Adivina por la Paleta** (`pokemon-palette-guess`) necesitan cartas TCG y paletas en la BD, que trae el data-sync (ver abajo). No es apto para producción hasta el corte 2D.

### Datos y administración en Java (etapa 2C, solo desarrollo)

Java sirve también las categorías personalizadas (`/api/categories`), los dilemas de Would You Rather (`/api/would-you-rather-prompts`), la subida y el borrado de avatares, el catálogo TCG (`/api/tcg/`) y la administración (`/api/admin/`). En desarrollo ya van a Java; en producción el corte 2D mueve nginx a la vez (lista en [docs/migracion-java-pendientes.md](docs/migracion-java-pendientes.md)).

El data-sync de Java (PokéAPI y TCGdex) está apagado por defecto. Para cargar paletas y cartas en la BD local arranca el backend con `BACKEND_DATA_SYNC_ENABLED=true` (y deja `DATA_SYNC_ENABLED=false` en Node: nunca dos sincronizadores a la vez): al arrancar sincroniza PokéAPI si faltan paletas (≈ 1 min) y lanza la sincronización inicial de TCG si no hay cartas; un ADMIN puede repetirlas desde la pestaña «Datos» del panel.

Los detalles de diseño están en [docs/architecture.md](docs/architecture.md).

## Puesta en marcha

Requisitos: Node 22 o superior, Java 25 (Gradle llega con `./gradlew`) y podman (o Docker) para PostgreSQL.

```bash
npm install                                   # dependencias y cliente Prisma
npm run db:up                                 # PostgreSQL local en el puerto 5432
cp .env.example .env                          # luego deja solo el bloque «Desarrollo local sin Compose»
npm run build -w @pokemon-universe/shared
set -a; . ./.env; set +a                      # el servidor no carga .env por sí solo
npm run db:seed                               # backend con sincronización: crea el esquema y descarga PokéAPI (minutos)
npm run dev                                   # Java en :8080 y web en http://localhost:5173
```

En el `.env` local quita la línea `VITE_API_URL`: la web usa el proxy de Vite. Pon también `DATA_SYNC_ENABLED=false` si no quieres sincronizar datos externos al arrancar. Esa variable solo la lee Node: el backend Java tiene su propio interruptor, `BACKEND_DATA_SYNC_ENABLED` (por defecto `false` hasta el corte 2D).

El backend Java (`npm run dev:backend`, recarga en caliente con `./gradlew run -t`) toma del entorno `JWT_SECRET`, `COOKIE_SECURE`, `WEB_ORIGIN` y `RATE_LIMIT_DISABLED`; la conexión a la BD local está fijada en `backend/src/main/resources/application-dev.yml` y el puerto se fuerza a 8080 aunque el `.env` traiga `PORT=3001`. Los avatares de invitado los sube Node a `apps/server/.data/avatars` y Java los sirve desde ese mismo directorio (`pu.avatar-storage-dir` en `application-dev.yml`, `../apps/server/.data/avatars` relativo a `backend/`; `AVATAR_STORAGE_DIR` lo sustituye). Los artworks del modo Artwork los lee de `pu.artwork-dir` (`../apps/server/assets/pokemon-artworks` por defecto, el mismo directorio que Node; `POKEMON_ARTWORK_DIR` lo sustituye).

Todo en contenedores con un solo comando:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
```

El esquema es de Flyway: al arrancar, el backend Java aplica `backend/src/main/resources/db/migration/` (en una BD vacía, `V1__baseline.sql` crea el esquema completo). `npm run db:seed` es el mismo backend de desarrollo con `BACKEND_DATA_SYNC_ENABLED=true`: carga el catálogo antes de abrir el puerto, así que cuando responde en :8080 ya está sembrado; se puede parar con Ctrl+C o dejarlo como backend. Prisma (`apps/server/prisma/`) queda congelado como modelo del oráculo Node y ya no crea ni migra la BD.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Backend Java y web en modo desarrollo (la web solo habla con Java). |
| `npm run dev:backend` | Solo el backend Java en :8080, con recarga en caliente. |
| `cd backend && ./gradlew check` | Pruebas, verificación de la especificación OpenAPI y demás comprobaciones del backend Java. |
| `npm run build` | Compila shared, server y web. |
| `npm test` | Pruebas unitarias con Vitest. |
| `npm run test:e2e` | Pruebas end-to-end con Playwright contra el backend Java (salas por `/ws`). Ver [e2e/README.md](e2e/README.md). |
| `npm run lint` | ESLint sin advertencias permitidas. |
| `npm run typecheck` | Comprobación de tipos de todo el monorepo. |
| `npm run db:up` / `npm run db:down` | Arranca o para el PostgreSQL local. |
| `npm run db:seed` | Arranca el backend Java con `BACKEND_DATA_SYNC_ENABLED=true`: crea el esquema si falta y carga o actualiza el catálogo Pokémon. |

## Contribuir

Las normas del proyecto están en [AGENTS.md](AGENTS.md). Cada cambio de interfaz se verifica con capturas de Playwright y se puntúa con la [rúbrica de revisión visual](docs/visual-review.md).

## Documentación

- [Arquitectura](docs/architecture.md)
- [Administración](docs/administration.md)
- [Preproducción](docs/pre-production.md)
- [Migración a Java: pendientes](docs/migracion-java-pendientes.md)
- [Rúbrica de revisión visual](docs/visual-review.md)
- [Pruebas end-to-end](e2e/README.md)

Los datos de Pokémon proceden de [PokéAPI](https://pokeapi.co/).
