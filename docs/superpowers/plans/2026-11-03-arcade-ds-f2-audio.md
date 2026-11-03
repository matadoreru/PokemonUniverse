# Arcade DS F2: Audio — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir los 6 sonidos de oscilador de `frontend/src/lib/sfx.ts` por el motor chiptune de Inazuma, con efectos de
interfaz en los componentes del catálogo, efectos de juego comunes a los 28 minijuegos, música original por fase de sala y
un diálogo de ajustes de audio.

**Architecture:** `frontend/src/audio/` porta el motor WebAudio de Inazuma (`engine`, `mixer`, `synth`, `voices`,
`variation`, `chiptune/tracker`, `music`) sin sus partes ligadas al fútbol. Los parámetros de cada efecto viven en
`frontend/src/data/sfx.json`, validado con Zod. Un único `audio` (singleton) expone `play(id)`, la música y los ajustes;
`uiSound` (F1) y `useSfxCue` pasan a ser adaptadores suyos, así que ningún juego cambia de API. Todo es síntesis: no hay
ficheros de sonido.

**Tech Stack:** Web Audio API, `OfflineAudioContext` para renderizar la música, Zod (ya en `@pokemon-universe/shared`),
React 19, Vitest (sin jsdom: el motor se prueba con un `AudioContext` falso), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §8 (y §1.9: ningún sonido es imprescindible).
Fuente del motor: `/home/eru/Documents/Projects/InazumaElevenManager/src/audio/` y `data/design/sfx.json`.

## Global Constraints

- Ids del catálogo, exactos: `ui.confirm`, `ui.tap`, `ui.cancel`, `ui.move`, `ui.tab`, `ui.tick`, `ui.open`, `ui.close`,
  `ui.error`, `room.join`, `room.leave`, `game.start`, `game.countdown`, `game.reveal`, `game.hit`, `game.miss`,
  `game.score`, `game.cutin`, `game.flip`, `game.clang`, `game.eliminate`, `game.bid`, `game.win`, `game.podium`.
- Canales y mezcla: `music` 0,55 · `sfx` 0,90 · `ui` 0,50. Variación ±35 cents y ±12 % de ganancia, determinista. Máximo
  10 voces; enfriamiento por efecto (por defecto 60 ms).
- Ajustes del usuario: silencio, volumen general, música, efectos e interfaz, en pasos 0 · 25 · 50 · 75 · 100 con curva
  cuadrática. **Apagado por defecto** en la primera visita. Persistencia en `localStorage` (clave `pokemon-universe-audio`),
  con migración de la clave antigua `pokemon-universe-sfx` (`'on'` → sonido activado con los volúmenes por defecto).
  Toda lectura y escritura de `localStorage` va en try/catch.
- El `AudioContext` solo se crea dentro de un gesto del usuario con activación real (se escuchan `pointerdown`,
  `pointerup`, `click` y `keydown`; mientras `navigator.userActivation.isActive` sea `false`, como en el `pointerdown`
  de un toque, se espera al siguiente evento) y con un contexto suspendido no se programan efectos; si el sonido estaba activado,
  lo pedido antes del gesto (música) se aplica al desbloquear y los efectos de antes se descartan. Nunca hay avisos de
  autoplay en consola. Pestaña oculta → `suspend()`; visible → `resume()`.
- Música: 3 temas originales compuestos con el tracker (`lobby`, `game`, `results`), renderizados una vez con
  `OfflineAudioContext` y cacheados; fundido de salida 0,4 s y de entrada 0,7 s, nunca solapados; baja (ducking al 30 %)
  mientras suena un `<audio>` de Cry Quiz.
- `M` silencia/activa el sonido en cualquier pantalla salvo cuando el foco está en un campo de texto.
- En desarrollo, `window.__puAudio = { state() }` con `{ unlocked, muted, recent: string[] }` (últimos 20 ids que sonaron
  o se pidieron con el sonido activado) para los E2E.
- Ningún dato de juego nuevo; ningún cambio de backend. Textos y comentarios en español.

## Review Focus

1. **Navegador sin `AudioContext` o con `localStorage` que lanza** (modo privado): nada lanza, el botón de ajustes funciona
   y `play` no hace nada. Test: «sobrevive sin AudioContext ni storage».
2. **Primera visita:** sonido apagado; pulsar una píldora no crea `AudioContext`. Test: `createAudio` con un contexto falso
   cuenta 0 creaciones hasta `setMuted(false)` dentro de un gesto.
3. **Usuario que ya tenía `pokemon-universe-sfx=on`:** entra con el sonido activado, sin crear contexto hasta su primer
   gesto. Test de migración.
4. **Ráfaga de efectos** (un deslizador arrastrado, muchos votos a la vez): nunca más de 10 voces y el enfriamiento corta
   repeticiones. Test del limitador.
5. **Cambio de fase rápido** (lobby → juego → resultados en menos de un segundo): la música no solapa dos temas. Test del
   reproductor con reloj falso.

---

### Task 1: Motor, catálogo y ajustes

**Files:**
- Create: `frontend/src/audio/engine.ts`, `mixer.ts`, `synth.ts`, `voices.ts`, `variation.ts`, `settings.ts`,
  `catalog.ts`, `index.ts`, y tests `engine.test.ts`, `settings.test.ts`, `catalog.test.ts`; `frontend/src/data/sfx.json`.
- Modify: `frontend/src/audio/uiSound.ts` (su sumidero por defecto pasa a ser `audio.play('ui.<kind>')`).

**Interfaces:**
- Produces:
  - `type SoundId` (unión de los 24 ids de Global Constraints) y `type Channel = 'music' | 'sfx' | 'ui'`.
  - `catalog.ts`: esquema Zod `SfxFileZ` (versión, `mix`, `limits`, `variation`, `music` con `fadeOutSec`/`fadeInSec`/`duck`,
    `sounds: Record<SoundId, SfxSound>`), con voces como las de Inazuma (`wave`, `freq`, `notes`, `step`, `slide`,
    `attack`, `hold`, `decay`, `gain`, `delay`, `filter`, `vibrato`); `loadSfx(): SfxFile` (parsea el JSON importado).
  - `settings.ts`: `AudioSettings = { muted: boolean; master: Step; music: Step; sfx: Step; ui: Step }` con
    `Step = 0 | 25 | 50 | 75 | 100`; `DEFAULT_SETTINGS` (`muted: true`, todos a 75); `loadSettings(storage)`,
    `saveSettings(storage, s)`, `migrateLegacy(storage)`; `stepGain(step) = (step / 100) ** 2`.
  - `engine.ts`: `createAudio(deps: { createContext(): AudioContextLike | null; storage: StorageLike | null; now(): number; document?: DocumentLike })`
    devuelve `Audio = { play(id: SoundId): void; unlock(): void; settings(): AudioSettings; update(patch: Partial<AudioSettings>): void; subscribe(fn): () => void; music: MusicControl; state(): { unlocked; muted; recent } }`.
    `index.ts` exporta el singleton `audio` (con dependencias del navegador), `useAudioSettings()` (con
    `useSyncExternalStore`) e instala el desbloqueo por gesto, la pausa por visibilidad, el atajo `M` y, en
    desarrollo, `window.__puAudio`.
  - `uiSound(kind)` de F1 llama a `audio.play(\`ui.${kind}\`)`.
- `sfx.json`: los 24 sonidos con estilo chiptune (puedes partir de los `ui.*` de Inazuma tal cual y diseñar los `room.*` y
  `game.*`: acierto = arpegio mayor ascendente corto; fallo = dos notas descendentes en cuadrada; revelación = barrido
  ascendente; cuenta atrás = pulso agudo de 40 ms; victoria y podio = fanfarria de 4–5 notas; choque = ruido filtrado;
  eliminación = barrido descendente con ruido; puja = dos notas rápidas; giro de carta = barrido breve; cut-in = golpe de
  ruido + nota; entrada y salida de sala = dos notas arriba / abajo).

- [ ] **Step 1: Tests.** `catalog.test.ts`: el JSON pasa `SfxFileZ`; sus claves son exactamente los 24 ids; la mezcla es
  0,55/0,90/0,50. `settings.test.ts`: por defecto silenciado; `migrateLegacy` con `'on'` activa el sonido una sola vez y borra
  la clave antigua; storage que lanza → valores por defecto sin excepción; `stepGain` (0 → 0, 100 → 1, 50 → 0,25).
  `engine.test.ts` (contexto falso que cuenta creaciones y voces): sin gesto no se crea contexto; silenciado no crea
  contexto ni voces; tras `unlock()` con sonido, `play` crea voces en el canal correcto; nunca más de 10 voces vivas;
  el enfriamiento descarta repeticiones; `recent` guarda los ids; «sobrevive sin AudioContext ni storage».
- [ ] **Step 2:** FAIL. **Step 3:** Portar e implementar. **Step 4:** `npm test -w @pokemon-universe/web`, typecheck, lint
  y build en verde.
- [ ] **Step 5:** Commit `Arcade DS F2: motor de audio chiptune, catálogo de sonidos y ajustes`.

### Task 2: Música

**Files:**
- Create: `frontend/src/audio/chiptune/tracker.ts` (portado), `frontend/src/audio/chiptune/songs.ts` (3 temas originales),
  `frontend/src/audio/music.ts` (reproductor), `frontend/src/audio/useRoomMusic.ts`, tests `music.test.ts`,
  `songs.test.ts`.
- Modify: `frontend/src/room/RoomSessionLayout.tsx` (llama a `useRoomMusic(phase)`), el reproductor de gritos de Cry Quiz
  (busca el `<audio>` en `frontend/src/room/CryQuizGame.tsx` o similar) para pedir `audio.music.duck(true|false)`.

**Interfaces:**
- Consumes: `createAudio`, `AudioContextLike`, `SfxFile.music` (Task 1).
- Produces: `MusicControl = { play(track: 'lobby' | 'game' | 'results' | null): void; duck(on: boolean): void }`;
  `renderSong(song, sampleRate): Promise<AudioBuffer>` cacheado por tema; `useRoomMusic(phase)` traduce la fase de sala
  (lobby, intro, juego, resultados de juego, votación, resultados de sesión) a `lobby | game | results`.
- Temas: `lobby` alegre en Do mayor ~120 bpm, bucle de 16 compases; `game` más tenso ~140 bpm; `results` fanfarria corta
  que no hace bucle y vuelve al silencio. Todo compuesto en código (notas en texto como en el tracker de Inazuma), sin
  melodías de Pokémon ni de ningún juego existente.

- [ ] **Step 1: Tests.** `music.test.ts` con reloj y contexto falsos: cambiar de tema funde salida 0,4 s y luego entrada
  0,7 s; dos cambios seguidos en 100 ms dejan un único tema sonando; `play(null)` funde a silencio; `duck(true)` baja la
  ganancia al 30 % y `duck(false)` la devuelve; silenciado no renderiza nada. `songs.test.ts`: cada tema parsea sin
  errores en el tracker y dura lo previsto.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde + typecheck + lint + build.
- [ ] **Step 5:** Commit `Arcade DS F2: música chiptune propia por fase de la sala`.

### Task 3: Efectos de juego y de interfaz conectados

**Files:**
- Delete: `frontend/src/lib/sfx.ts` (+ su test).
- Modify:
  - `frontend/src/hooks/useSfxCue.ts`: firma igual, pero acepta `SoundId | LegacyCue` y traduce los nombres antiguos
    (`tick` → `ui.tick`, `hit` → `game.hit`, `miss` → `game.miss`, `reveal` → `game.reveal`, `win` → `game.win`,
    `clang` → `game.clang`); llama a `audio.play`.
  - `frontend/src/ui/Timer.tsx` y `frontend/src/components/ServerTimer.tsx`: `game.countdown` una vez por segundo en los 3
    últimos (con clave por segundo para no repetir).
  - `frontend/src/ui/Cutin.tsx`: `game.cutin` al aparecer (no con reducción de movimiento si se salta; sí suena igual).
  - `frontend/src/ui/Card.tsx`: `game.flip` cuando pasa a `revealing`.
  - `frontend/src/room/PlayerList.tsx`: `room.join`/`room.leave` cuando cambia la lista de conectados (no en el primer
    render).
  - `frontend/src/room/GameIntro.tsx`: `game.start` al montar.
  - `frontend/src/room/RoomSessionLayout.tsx`: `game.reveal` cuando la fase del juego pasa a resultados de ronda (si el
    juego no lo pide ya; evita duplicar con los `useSfxCue('reveal', …)` existentes).
  - `frontend/src/room/ResultsShell.tsx` y `frontend/src/room/SessionResults.tsx`: `game.win` (si el propio jugador gana) y
    `game.podium` al montar el podio de la sesión.
  - `frontend/src/room/PokemonImpostorGame.tsx`: `game.eliminate` en la expulsión (en lugar de `reveal`);
    `frontend/src/room/TeamAuctionGame.tsx` y `BluffAuctionGame.tsx`: `game.bid` en cada puja nueva ajena o propia;
    `frontend/src/components/ScorePop.tsx`/`ui/ScorePop.tsx`: `game.score` cuando el «+N» es del propio jugador.
- Tests: `useSfxCue.test.ts` (traducción de nombres antiguos, no suena en el primer render), y en `Timer.test.tsx`
  una función pura `countdownCue(endsAt, now, lastCued)` que decide cuándo sonar.

- [ ] **Step 1:** Tests → FAIL. **Step 2:** Implementar. **Step 3:** `grep -rn "lib/sfx" frontend/src` vacío; verde +
  typecheck + lint + build.
- [ ] **Step 4:** Commit `Arcade DS F2: efectos de juego comunes a los 28 minijuegos`.

### Task 4: Ajustes de audio en la cabecera

**Files:**
- Create: `frontend/src/components/AudioSettingsDialog.tsx` (+ test), `frontend/src/components/AudioButton.tsx`.
- Modify: `frontend/src/components/Layout.tsx` (sustituye `SoundToggle` por `AudioButton`), borrar
  `frontend/src/components/SoundToggle.tsx`; `frontend/src/ui/dev/Gallery.tsx` (figura del diálogo de audio).
- `AudioButton`: `Pill` `round` con icono de altavoz (tachado si `muted`), `aria-label` «Ajustes de sonido»; abre el
  diálogo. `AudioSettingsDialog` (usa `Dialog` del catálogo): `Toggle` «Sonido» (= `!muted`), y cuatro `Segmented` de
  0/25/50/75/100 para «Volumen general», «Música», «Efectos» e «Interfaz» (deshabilitados si está silenciado), una línea
  «Atajo: M» y un botón «Probar sonido» que suena `game.hit`. Activar el sonido desde el diálogo cuenta como gesto y
  desbloquea el audio.
- Test: el diálogo pinta los cuatro segmentos con su valor y el toggle con `aria-checked`; cambiar un segmento llama a
  `audio.update` con el paso.

- [ ] **Step 1:** Test → FAIL. **Step 2:** Implementar. **Step 3:** verde + typecheck + lint + build.
- [ ] **Step 4:** Commit `Arcade DS F2: ajustes de sonido en la cabecera con volumen por canal`.

### Task 5: Verificación (controlador)

- [ ] E2E nuevo `e2e/tests/audio.spec.ts` (lo escribe un implementador; lo ejecuta el controlador): primera visita sin
  sonido y sin `AudioContext` (`__puAudio.state().unlocked === false` tras pulsar una píldora); abrir ajustes, activar el
  sonido, pulsar una píldora → `recent` contiene `ui.confirm`; `M` silencia; recargar conserva los ajustes; ningún
  mensaje de consola sobre autoplay; capturas del diálogo a los 3 tamaños.
- [ ] E2E existentes: `sala`, `inicio`, `galeria` y `juegos -g "pokedex-distance|pokemon-impostor|type-duel"` (cabecera
  nueva y efectos conectados). Borrar `backend/.micronaut/test-resources` antes de cada ejecución.
- [ ] Revisión final de la rama, arreglos, fusión en `main` y push.
