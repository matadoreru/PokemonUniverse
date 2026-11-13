# El Intruso — diseño corto

Fecha: 2026-11-13. Aprobado por el usuario en la conversación. Primer juego de la tanda nueva (orden acordado: El
Intruso → Blind Ranking → Smash or Pass → Emoji → Mystery Box → Fusion, con QOL intercalada).

## Intención

Quiz de deducción: cuatro Pokémon, tres comparten una categoría **que no se enseña** y uno es el intruso. Se busca un
juego de pensar, distinto de los de adivinar por imagen o sonido que ya hay. El usuario lo propuso como «Who Is The
Fake?»; se llama **El Intruso** para no confundirlo con *One of Us Is Fake* en el lobby y en la votación.

## Approaches

- A. Categoría a la vista («¿Cuál no es inicial de Kanto?»): quiz rápido sin ambigüedad, pero se parece a lo que hay.
- **B. Categoría oculta (elegida por el usuario)**: deducir qué une a tres; más distinto, con riesgo de ambigüedad que
  resuelve el servidor (abajo).
- C. Las dos como modos: descartada por el usuario; puede llegar más adelante como modo «Pista».

## Reglas

- Ronda: 4 Pokémon en orden aleatorio. Todos eligen a la vez y en privado; un único voto, bloqueado al elegir.
- Revelación: la categoría (etiqueta y explicación del catálogo), cuál era el intruso y qué votó cada uno.
- Puntos: 1 por acierto; los tres primeros en acertar suman 3, 2 y 1 extra (como Shiny Quiz).
- Ajustes: generaciones, rondas (10), segundos por ronda (20) y «Ritmo» rápido / clásico / experto (valores concretos
  a decidir por el constructor, coherentes con Shiny Quiz). 1–8 jugadores.

## Generación del tablero (servidor)

Un tablero es válido solo si:

1. el intruso no pertenece a la categoría de los otros tres;
2. ninguna otra categoría **distintiva** del catálogo (la que reúne como mucho un tercio de los Pokémon en juego)
   contiene al intruso y a dos de los otros tres; la categoría secreta también es distintiva. Un rasgo que comparte
   casi todo el pool («no legendario») no es una respuesta alternativa defendible, y contarlo convertía el juego en
   «encuentra al legendario»;
3. si puede, el intruso comparte tipo o generación con alguno de los tres, para que no sea obvio.

Las categorías de aspecto son listas a mano e incompletas: en ellas el intruso se toma de un tipo claramente distinto.
Si no se encuentra tablero válido tras varios intentos, se prueba otra categoría.

## Construcción

- Reutiliza las categorías de `PokemonConnectionsCatalog`, que se extraen a un catálogo compartido sin cambiar el
  comportamiento de Connections (sus fixtures doradas no deben cambiar).
- Motor Java nuevo con fixtures doradas, entrada en `registry.json`, registro en `portedEngines`, esquema Zod y
  proyecciones en `packages/shared`, pantalla y resultados con los kits existentes, e2e por juego y capturas a los
  tres tamaños con nota de la rúbrica visual.

## Fuera de alcance

Modo «Pista» con la categoría a la vista, logros y estadísticas de perfil propias más allá de las comunes.
