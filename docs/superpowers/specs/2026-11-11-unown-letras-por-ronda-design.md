# Traductor Unown: letras por ronda y pantalla más grande (2026-11-11)

Petición del usuario: la interfaz es muy pequeña, el Pokémon de la revelación también; al principio deben verse pocas
letras e ir apareciendo más; y una letra revelada debe sustituir a su glifo Unown en el mensaje.

## Mecánica (motor Java, cambio de comportamiento aprobado: se regraban las doradas de unown-translator)

- **El alfabeto se reinicia en cada ronda.** Hoy se acumula durante la partida y en las últimas rondas el mensaje sale
  casi traducido desde el primer segundo. A partir de ahora cada ronda empieza sin letras conocidas. La clave
  glifo→letra sigue siendo la de toda la partida.
- **Letras iniciales según la longitud del mensaje:** al empezar la ronda se revelan 1 letra distinta si el mensaje
  tiene 6 letras A-Z o menos y 2 si tiene más (sin superar las letras distintas del mensaje menos una, para que
  nunca salga entero). Se eligen con el mismo `Randoms.randomItem` entre las letras ocultas en orden alfabético que ya
  usan las pistas.
- **Las pistas siguen igual:** una letra más cada `hintSeconds`, hasta que no queden letras ocultas o acabe la ronda.
- **Puntos sin cambios de regla:** 1 por descifrar y 1 más por cada posición que siguiera oculta. Las letras iniciales
  cuentan como reveladas.

## Pantalla

- **Una letra revelada sustituye a su glifo en el mensaje:** se pinta la letra grande en lugar del glifo con la letra
  debajo. El alfabeto de abajo sigue mostrando glifo y letra.
- **Mensaje más grande:** los glifos del mensaje y las letras reveladas llenan el escenario a los tres tamaños, sin
  romper líneas por dentro de una palabra y sin scroll.
- **Leyenda más legible.**
- **Revelación:** el sprite del Pokémon (o el bloque del movimiento) se ve claramente más grande.
- Componentes del catálogo `ui/` (`UnownGlyph`); un tamaño o estado nuevo va antes a la galería `/dev/ui`.
- Se verifica con `ui:check` de juegos y galería, y la pantalla se puntúa con la rúbrica de `docs/visual-review.md`.
