# Pokémon artworks locales

Esta carpeta es exclusivamente para las imágenes del modo **Artwork** de Zoomed Pokémon.

## Formato y nombre

- Usa PNG (`.png`). Se recomienda fondo transparente y una ilustración nítida de al menos 512×512 px.
- El nombre del archivo debe ser exactamente el `id` canónico del Pokémon en el catálogo, en minúsculas: `bulbasaur.png`, `volcarona.png`.
- Las formas usan su propia clave completa: `vulpix-alola.png`, `gengar-mega.png`, `charizard-gmax.png`, etc. Una forma solo puede ser target si esa clave existe también como Pokémon independiente en el catálogo.
- No añadas iconos, avatares ni sprites de otros juegos a esta carpeta.

No hay que editar código ni mantener una lista manual. Al arrancar, el servidor indexa los nombres, comprueba que cada clave exista en el catálogo, valida el PNG y analiza su canal alpha. Los archivos inválidos o prácticamente transparentes se ignoran.

Si falta un artwork, el modo **Mixto** usa el sprite disponible como fallback. El modo **Artwork** limita el pool a los PNG válidos; si no queda ninguno para las generaciones elegidas, el servidor impide iniciar y muestra el motivo.
