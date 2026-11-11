# Arreglos de la auditoría de calidad (2026-11-11)

Informe completo, con cada hallazgo (fichero:línea, por qué, arreglo, riesgo y esfuerzo): artifact
https://claude.ai/artifact/NWWWonGk832QDLKTvvbQ2B, sobre el commit 8d1ec442. Esta spec fija las decisiones y las
reglas comunes; cada paquete se hace en su rama, con revisión, y se fusiona en main con push al terminar.

## Decisiones

| | Decisión | Motivo |
|---|---|---|
| D1 | El deslizador de rondas de Pokéddle sube a 30, como Zod y Java. | El contrato del motor manda; bajar a 15 obligaría a regrabar `config-cases.json` sin ninguna razón documentada. |
| D2 | Los errores que llegan en inglés se traducen al español. | Toda la interfaz está en español; un texto técnico en inglés no ayuda a nadie. |
| D3 | Un solo selector para los atajos: se ignoran solo en campos editables (`input`, `textarea`, `select`, `[contenteditable]`, incluido el valor vacío). Las teclas Intro y Espacio nunca son atajo cuando el foco está en un control. | Es la convención de las aplicaciones web (los atajos de una tecla solo se apagan al escribir). Un usuario de teclado que ha tabulado hasta un botón sigue pudiendo usar los números; Intro y Espacio siguen activando el control con foco. |
| D4 | Se quita la regla global `!important` de movimiento reducido y se cumple el spec Arcade DS §3.4: con movimiento reducido quedan los fundidos de opacidad de 120 ms. | El spec lo permite; las clases `motion-*` llevan su propio `reduce`. |
| D5 | Se borran `DailyResultsReader`, `finishedBy` y `findFinishedByUser`; `DailyResultEvents` se queda como gancho. | Nada los usa; la historia de git los conserva si algún logro de reto los necesita. |
| D6 | En el PATCH del changelog, `published` ausente significa «sin cambios». | Es la semántica de un PATCH; hoy una corrección de título despublica la entrada. |
| D7 | Se aceptan los tres detalles menores: sonido «tap» en las filas pulsables, «Entrenador» en vez del id interno y duraciones `motion-*` desde los tokens. | Alinean el comportamiento con el resto del catálogo. |

## Reglas comunes

- Sin cambios visibles fuera de las decisiones anteriores. Cualquier cambio de UI se comprueba con `npm run ui:check`
  y sus capturas se miran antes de dar el paquete por hecho; solo se versionan las capturas que cambian a propósito.
- Las doradas no se regraban. Los paquetes de motores (4, 5 y 6) tienen que pasar `GoldenReplayTest` sin `-Dupdate`.
- Tests acotados a lo tocado, más `npm run typecheck` y `npm run lint` (y `./gradlew check` en los paquetes de Java).
- Un commit por hallazgo o por grupo coherente, con mensaje breve en español.

## Paquetes y orden

0 e2e en verde (hecho) · 1 purga de shared · 2 guardas Java↔TS y CI (incluye el job de e2e, 0.4) · 3 una región viva ·
4 tests de privacidad · 5 helpers de infra · 6 esqueleto de adivinar · 7 preparación única · 8 RoomCoordinator ·
9 limpieza REST · 10 errores de la API · 11 paneles de config · 12 duplicados de sala · 13 catálogo ui ·
14 kits de tests · 15 movimiento reducido · 16 atajos · 17 estructura.

Dependencias: 1 → 2 → 7; 4 → 5 → 6; 9 → 8 (los dos tocan `RoomCoordinator`); 3 → 12; 11 → 13; 17 el último.
