# Ranking a Ciegas — diseño corto

Fecha: 2026-11-13. Aprobado por el usuario en la conversación. Segundo juego de la tanda nueva (tras El Intruso).

## Intención

El formato viral «blind ranking» llevado a la sala: los Pokémon salen de uno en uno y cada uno se coloca para siempre
en un hueco del 1 al N sin saber qué vendrá después. La gracia es la apuesta a ciegas; la comparación con el grupo da
el debate.

## Approaches

- A. Criterio objetivo (peso, ataque…) con orden real al final: más quiz; descartado por el usuario.
- **B. Criterio subjetivo puntuado por parecido con el grupo (elegido)**: social, reutiliza la puntuación de Secret
  Ranking; se distingue de él por la colocación a ciegas y uno a uno.
- C. Sin puntos, solo comparar: no encaja en la sesión con clasificación.

## Reglas

- Id `blind-ranking`, nombre «Ranking a Ciegas», 3–8 jugadores.
- Ronda: una consigna subjetiva (las de `SecretRankingPrompts`) y N Pokémon (5–10, por defecto 10), los mismos y en el
  mismo orden para todos.
- Se muestra un Pokémon cada vez; cada jugador lo coloca en privado en un hueco libre del 1 al N, sin poder moverlo.
- Plazo por Pokémon: 15 s. Cuando todos los jugadores necesarios han colocado, sale el siguiente. A quien se le acaba
  el tiempo, el servidor le coloca el Pokémon en un hueco libre al azar.
- Durante la ronda solo es público quién ha colocado el Pokémon actual, nunca dónde.
- Revelación de la ronda: el ranking del grupo (posición media), el ranking de cada jugador y los Pokémon más
  polémicos (mayor dispersión de posiciones).
- Puntos: los de Secret Ranking (distancia footrule contra la posición media del resto y puntos por puesto).
- Ajustes: generaciones, rondas (3), Pokémon por ronda (5–10, 10), segundos por Pokémon (15) y «Ritmo».

## Construcción

Motor Java nuevo con fixtures doradas, entrada en `registry.json`, `portedEngines`, contrato en `packages/shared`,
pantalla y resultados con los kits existentes, e2e y capturas a tres tamaños con nota de la rúbrica. Reutiliza
`SecretRankingPrompts` y `SecretRankingRules.secretRankingDistances` sin cambiar el comportamiento de Secret Ranking.

## Fuera de alcance

Modo objetivo (A), consignas propias, logros y estadísticas de perfil propias más allá de las comunes.
