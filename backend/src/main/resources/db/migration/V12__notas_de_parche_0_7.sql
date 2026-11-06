-- Notas de parche 0.7.0: lo publicado desde la 0.6.0 (6 de noviembre de 2026), escrito para los jugadores a partir
-- del historial de git. Se inserta ya publicada; si la versión ya existe (escrita a mano desde Administración), se
-- respeta la que hay. "highlight" solo aparece cuando es true, como lo guarda ChangelogChange.
INSERT INTO public."Changelog" (id, version, title, summary, date, published, content, "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, '0.7.0', 'Chat del lobby y perfiles de jugadores',
     'Charla en el lobby, visita los perfiles de tus amigos, elige qué modos pueden salir en la sesión y descubre las nuevas categorías de Pokémon Connections.',
     TIMESTAMP '2026-11-06 20:00:00', true,
     $json$[
       {"type": "NEW", "text": "Chat en el lobby: escribe a toda la sala mientras elegís minijuego. El Host y el Co-host pueden borrar mensajes y silenciar, hay un filtro de palabrotas y un límite de mensajes por minuto. En el móvil va en su propia pestaña «Chat».", "highlight": true},
       {"type": "NEW", "text": "Perfiles de jugadores: visita el perfil de tus amigos o busca a alguien por su nombre de usuario para ver su nivel, estadísticas y logros. En tu perfil, «Privacidad» decide quién puede verlo: todos, solo amigos o nadie.", "highlight": true},
       {"type": "NEW", "text": "Modos en la sesión: las cartas dicen cuántos modos tiene cada minijuego y, con la sesión al azar o por votación, eliges qué modos pueden salir; cada modo es una opción distinta en la votación.", "highlight": true},
       {"type": "MINIGAMES", "text": "Pokémon Connections: 36 categorías nuevas y curiosas (ases de los líderes de gimnasio, el equipo de Ash, tienen bigote, rocas con cara, maestros del disfraz…) y como mucho una categoría de datos por tablero. Se retiran las de forma corporal, peso y estadísticas, que no se adivinaban."},
       {"type": "MINIGAMES", "text": "Pokémon Red Flag / Green Flag pasa a llamarse La Frase Pokémon: escribe la frase que mejor representa al Pokémon, con tono «Lo peor», «Lo mejor» o «Mixto»."},
       {"type": "MINIGAMES", "text": "Sketchmon y PokéTaboo: con los intentos públicos apagados, quien dibuja o describe sigue viendo los intentos de los demás."},
       {"type": "INTERFACE", "text": "Team Auction se entiende mejor: el estado de la puja en una sola tarjeta con el orden de turno, un mensaje claro cuando no es tu turno y sin el total de estadísticas del Pokémon que se subasta. Bluff Auction recibe los mismos retoques."},
       {"type": "INTERFACE", "text": "¿Quién es el fake? y los demás juegos de votación muestran el recuento con un avatar por voto y cada candidato en una línea; tu carta también se destapa con animación."},
       {"type": "INTERFACE", "text": "Sketchmon tiene un lienzo bastante más grande y Pokémon Bingo, sprites más grandes y nítidos en las casillas."},
       {"type": "INTERFACE", "text": "Las pistas van siempre debajo de la pista principal, también en Learnset Guess y PokéTaboo, y PokéTaboo enseña la carta secreta entera en pantallas bajas."},
       {"type": "IMPROVEMENTS", "text": "El buscador de Pokémon carga más rápido: las miniaturas se preparan al arrancar el servidor y el catálogo no se vuelve a pedir en cada turno."},
       {"type": "BUGS", "text": "El aviso «Too many requests» ya no aparece jugando normal: el límite de peticiones ahora cuenta por jugador y las miniaturas del buscador tienen el suyo."}
     ]$json$::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
