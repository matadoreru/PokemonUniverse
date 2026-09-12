# Aplicación de la revisión técnica

Seguimiento de [la revisión original](revision-tecnica-2026-09-12.md). Los cambios se han aplicado sobre el repositorio, sin crear commits ni desplegar servicios. El informe original describe los defectos previos; este documento distingue las correcciones de las ampliaciones que todavía requieren trabajo.

## Cambios por entrega

| Orden | Cambios implementados | Comprobación y límites |
| --- | --- | --- |
| 1 | Recortes reales de Zoomed por etapa, rechazo de etapas futuras, validaciones de deadline en Bluff/Connections/Fake, avance temporal previo y sincronización del estado devuelto por acciones rechazadas | Tests de píxeles, URLs, timeout y transición inmediata de sala |
| 2 | Desasociación condicionada al propietario de la membresía; cancelación y guardas de timers de expulsión; retirada de sockets; epoch de acción; emisor tipado con ACK de ocho segundos y cancelación por desconexión | Tests de ownership, expulsión/reentrada, paquete de una ronda anterior, desconexión y ACK tardío. No hay repetición automática de comandos ni garantía de idempotencia para un reintento manual |
| 3 | Importación de dilemas en transacción; actualización de la pareja completa y clave normalizada con aislamiento serializable y reintentos; serialización de mutaciones por usuario y publicación de caché tras commit | Tests de servicio y tres regresiones PostgreSQL conectadas a CI mediante `TEST_DATABASE_URL`; estas últimas no se han ejecutado localmente |
| 4 | Estado runtime `unknown`; contrato obligatorio `getLifecycle` en los 28 motores; autorización de cursores dentro del motor y transporte en `CursorChannel`; disponibilidad de catálogo declarada por TCG | Tests de motores y coordinación. La unión global de fases y parte de la validación estática por ID siguen existiendo |
| 5 | Barajado y decks comunes; condiciones de Pokémon fuera de Bingo; normalización de contenido del servidor compartida; contabilidad de aciertos común en Stats y Entry Guess | Se conservan reglas particulares, matching de Bingo y aislamiento del snapshot de precios TCG; tests funcionales y de generación |
| 6 | Base pública calculada una vez por broadcast; identidad/revisión de sala y descarte de snapshots antiguos; estructuras compartidas y presupuestos de Sketchmon | Benchmark reproducible de proyección, tests de privacidad y límites. La red todavía envía snapshots completos |
| 7 | Seguimiento y drenaje de resultados/auditoría; cierre idempotente y scheduler que no se rearma tras detenerse; snapshots de catálogo Pokémon/audio/visual por partida; copias congeladas; HTTP y caché de imágenes con límites | Tests de cierre de tareas, scheduler, snapshot de catálogo, descarga bloqueada, reintentos y presupuestos. No existe outbox durable ni plazo máximo global de cierre |
| 8 | Puntuación de sesión `POSITION_V1`, conservación de puntos brutos; autopase configurable en Team Auction/Bluff y asignación de secretos al vencer selección manual | Tests de escalas distintas, empates, deadline exacto y modos sin reloj; paneles y timers actualizados |
| 9 | Export `shared/public`, regla ESLint y comprobador transitivo de imports; cancelación HTTP real en el hook de Pokémon; manejo del fallo inicial de auth; invalidación de votos asíncronos; eliminación de caché ficticia de resultados y escritura de `avatarSeed`; documentación actualizada | El frontend compila sin importar motores. Se mantienen tests estáticos de UI existentes; las nuevas pruebas de comandos/proyección no sustituyen una suite de interacción en navegador |

## Medición de Sketchmon

Comando: `npm run benchmark:rooms`, Node v22.23.2. Escenario sintético: 20 salas de ocho jugadores, 128 trazos de 64 puntos, 64 entradas de undo, 100 iteraciones tras calentamiento.

| Métrica | Resultado local |
| --- | ---: |
| Proyección pública repetida ocho veces por sala, patrón previo | 1.555,47 ms |
| Una proyección pública por sala, patrón actual | 194,27 ms |
| Snapshot público serializado | 231.093 bytes |
| Referencias a puntos en el historial | 391.168 |
| Objetos de punto únicos compartidos en ese historial | 8.128 |

Es una comparación aislada de CPU con el mismo estado, no una prueba de carga del servidor ni de red. La reducción de trabajo de proyección no reduce por sí misma los bytes enviados. Los límites son salvaguardas operativas, no una capacidad de producción certificada.

## Cambios de contrato y comportamiento

- Desplegar server y web juntos: `game:action` exige `actionEpoch` además de `gameInstanceId`.
- Los premios de sesión dependen de la posición para jugadores con puntuación positiva; puntuación cero no genera premios. El historial conserva `rawPoints` y la versión. Los perfiles siguen usando puntos propios del minijuego.
- `bidSeconds` vale 20 por defecto en las dos subastas; cero desactiva el reloj. `selectionSeconds` vale 30 para secretos manuales; cero permite selección sin límite. Las configuraciones guardadas se normalizan con los defaults nuevos.
- El catálogo se renueva para partidas nuevas, conservando las referencias de partidas activas. El buscador HTTP general sigue ofreciendo el catálogo actual; no expone versiones antiguas por endpoint.
- No se han añadido migraciones. La columna histórica `avatarSeed` se conserva, aunque ya no se escribe en registro.
- El despliegue sigue siendo de un único proceso autoritativo; no habilitar múltiples instancias mediante un simple cambio de store.

## Trabajo que sigue pendiente

La revisión completa no debe darse por cerrada: estas ampliaciones no están implementadas.

1. Operaciones/deltas de dibujo con secuencia y recuperación mediante snapshot, más una prueba de carga con transporte real y salas simultáneas.
2. Outbox durable e idempotente por `resultId`, recuperación después de caída abrupta y política de plazo/cancelación del cierre. El drenaje actual espera tareas, pero no convierte los errores de DB en resultados recuperables.
3. Disponibilidad de dataset por módulo para todos los juegos, extracción completa de validadores estáticos, separación de fases internas y preferencias/contenido cargados por usuario con límites e invalidación.
4. Versionado coherente del buscador cliente para partidas que conservan un catálogo anterior, y deduplicación de consultas por versión/filtros.
5. Separación funcional adicional de Lobby, cola/reconciliación de canvas y tipado de las props específicas de cada módulo; suite DOM/navegador para efectos, doble click, cambios de ronda y reconexiones reales.
6. Evaluar las hipótesis de jugabilidad de los otros juegos con partidas de prueba; no aplicar cambios de balance arbitrarios solo por figurar en la revisión.

Las pruebas PostgreSQL nuevas requieren un servicio disponible y migrado. En este entorno no hay binarios de PostgreSQL ni Docker; CI tiene un servicio PostgreSQL y ahora proporciona explícitamente `TEST_DATABASE_URL`.

## Verificación local final de esta entrega

Con Node v22.23.2:

- `npm test`: 756 tests aprobados (server 181, web 161, shared 414); tres pruebas de PostgreSQL omitidas por falta de `TEST_DATABASE_URL`.
- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado, cero warnings.
- `npm run build`: aprobado para shared, server y web.
- `npm run check:boundaries`: 108 módulos del grafo público comprobados.
- `git diff --check`: aprobado.

No se ha realizado despliegue, prueba de carga con transporte real ni validación visual en navegador. El build actual separa el chunk público compartido (aproximadamente 34 kB sin comprimir), pero no se usa esa cifra como comparación con un build anterior que no se midió.
