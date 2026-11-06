# Perfiles de otros jugadores

Fecha: 2026-11-06. Estado: decisiones del usuario tomadas en conversación (2026-11-06).

## Objetivo
Una cuenta registrada puede visitar el perfil de sus amigos y el de cualquier cuenta cuyo nombre de usuario conozca.

## Decisiones del usuario
- **Quién ve:** solo cuentas registradas (`USER`). Los invitados no (401/403 y la interfaz no ofrece la opción).
- **Qué se ve (perfil visible):** nombre, avatar, nivel y «Miembro desde»; estadísticas (resumen y por minijuego, como en el perfil propio); logros desbloqueados (los secretos que no tenga no se muestran: solo los suyos desbloqueados, más el contador «N/48»); botón de amistad («Añadir amigo», «Solicitud enviada», «Aceptar solicitud», «Ya sois amigos»).
- **Privacidad:** opción «Perfil visible para» en los ajustes de la cuenta: **Todos** (por defecto), **Solo amigos**, **Nadie**. Con «Solo amigos» (y quien mira no es amigo) o con «Nadie» (cualquiera salvo el dueño, también los amigos), se ve un estado «Este perfil es privado» con el nombre, el avatar y el botón de amistad (añadir amigos por nombre de usuario ya existe, así que no se oculta), sin nivel, estadísticas ni logros. El dueño siempre ve su propio perfil completo.

## Diseño
### Backend (Java, hexagonal)
- Migración Flyway **V11** (`V11__perfil_visible.sql`): columna `profileVisibility` en la tabla de usuarios, enum/texto `EVERYONE | FRIENDS | NOBODY`, por defecto `EVERYONE`, no nula. (V10 son las notas de parche 0.6.0; el reto diario pasa a V12.)
- `GET /api/users/{username}/profile` (solo `USER`; invitados y sin sesión → 401 como el resto de rutas de cuenta). Búsqueda del nombre de usuario sin distinguir mayúsculas. Respuestas:
  - 404 si no existe (también para cuentas no `USER`).
  - 200 con `{ username, displayName, avatar, level, xp…(lo que ya expone el perfil propio para el nivel), memberSince, visibility, friendship: NONE|PENDING_SENT|PENDING_RECEIVED|FRIENDS|SELF, private: boolean, stats?: …, achievements?: … }`. Si `private`, sin `stats` ni `achievements`.
  - Reutiliza los casos de uso existentes de estadísticas y de logros (`GET /api/achievements` del propio usuario) parametrizados por id de usuario; los logros secretos no desbloqueados nunca salen.
- `PATCH` del ajuste: añade `profileVisibility` a la ruta de perfil propio existente (`/api/auth/profile`) o la de preferencias que ya use la pantalla de ajustes; valida el enum.
- Regenerar `backend/openapi/pokemon-universe.yml` y `frontend/src/lib/api-types.ts` (`npm run api:types -w @pokemon-universe/web`).
- Tests Java: visibilidad (todos/amigos/nadie × amigo/no amigo/uno mismo), 404, invitado rechazado, secretos ocultos, búsqueda sin mayúsculas.

### Frontend
- Ruta `/u/:username` con la pantalla del perfil ajeno, reutilizando las piezas del perfil propio (`ProfilePage`/`ProfileDetail`, pestañas «Estadísticas» y «Logros») en modo solo lectura, más el botón de amistad (reutiliza las órdenes de amigos existentes).
- Entradas:
  - en el panel de amigos, cada amigo enlaza a su perfil («Ver perfil»);
  - un buscador «Buscar jugador» (nombre de usuario exacto) en el panel de amigos (pestaña «Añadir amigo» o junto a ella) que lleva a `/u/<nombre>`;
  - en salas/resultados no se añade nada en esta entrega.
- Ajustes de la cuenta: control «Perfil visible para» (Todos / Solo amigos / Nadie) con texto de ayuda.
- Estados: cargando, no encontrado («No hay ningún jugador con ese nombre.»), privado, error con reintento.
- Arcade DS, texto ≥ 13 px, una sola región viva, captura Playwright a 1280×720, 1920×1080 y 390×844 y rúbrica ≥ 19/24.

## Pruebas
Solo lo tocado: clases Java nuevas/cambiadas, Vitest de las pantallas tocadas, `npm run typecheck`, `npm run lint`, un spec de Playwright (nuevo `e2e/tests/perfiles.spec.ts` con dos cuentas: ver perfil, privado, solo amigos).
