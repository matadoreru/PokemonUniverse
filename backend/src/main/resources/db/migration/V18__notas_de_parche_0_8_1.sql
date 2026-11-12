-- Notas de parche 0.8.1: el pulido del juego (12 de noviembre de 2026), escritas para los jugadores a partir del
-- historial de git desde la 0.8.0. Se insertan ya publicadas; si la versión ya existe (escrita a mano desde
-- Administración), se respeta la que hay. "highlight" solo aparece cuando es true, como lo guarda ChangelogChange.
INSERT INTO public."Changelog" (id, version, title, summary, date, published, content, "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, '0.8.1', 'Partidas más ágiles',
     'Menos esperas entre rondas, un diálogo de ajustes con movimiento y tamaño de letra, enlaces para entrar en una sala y muchos detalles de las pantallas de juego, sobre todo en el móvil.',
     TIMESTAMP '2026-11-12 12:00:00', true,
     $json$[
       {"type": "NEW", "text": "«Siguiente» en los revelados: entre ronda y ronda aparece un botón con el recuento de quién está listo. Cuando lo han pulsado todos, la siguiente ronda empieza enseguida en vez de esperar al reloj.", "highlight": true},
       {"type": "NEW", "text": "Ajustes: el diálogo de sonido ahora también deja elegir el movimiento (el del sistema, reducido o completo) y el tamaño del texto (normal, grande o muy grande).", "highlight": true},
       {"type": "NEW", "text": "Entrar por enlace: el botón del código de la sala copia un enlace (en el móvil abre el menú de compartir). Quien lo abre entra directamente en la sala.", "highlight": true},
       {"type": "NEW", "text": "Ritmo: los paneles de configuración con rondas o tiempo tienen arriba un control con tres opciones (Rápido, Clásico y Experto) que ajusta todos los valores de una vez."},
       {"type": "NEW", "text": "Rachas opcionales en Who's That Pokémon?, Cry Quiz y Palette: cada acierto seguido a partir del segundo suma 1 punto más, hasta 3. Vienen apagadas."},
       {"type": "NEW", "text": "Opción de sesión «La última partida vale doble», para las sesiones por número de partidas. Viene apagada."},
       {"type": "NEW", "text": "«Cómo se juega»: un «?» en la partida, en cada carta del lobby, en el editor de ajustes y en la votación abre las reglas del minijuego y sus atajos de teclado."},
       {"type": "MINIGAMES", "text": "Los resultados de una partida siguen solos a los 20 segundos si queda sesión, con la cuenta atrás a la vista. El anfitrión puede seguir antes, como hasta ahora."},
       {"type": "MINIGAMES", "text": "Un corte de conexión de hasta 8 segundos ya no cuenta como abandono en ningún minijuego (antes solo en siete)."},
       {"type": "MINIGAMES", "text": "¿Quién soy?: las cartas de los jugadores llenan la pantalla en escritorio, cada pista va en su tarjeta con la respuesta de cada jugador en color (Sí, No, A medias, No lo sé) y la pregunta en curso se lee más grande."},
       {"type": "BALANCE", "text": "El revelado de Pokémon Connections dura 15 segundos (antes 30) y el de Type Duel, 7 (antes 10)."},
       {"type": "BALANCE", "text": "Por defecto, Who is Who juega 15 rondas (antes 25) y One of Us Is Fake da 2 minutos de debate (antes 3). Las configuraciones que ya tenías guardadas no cambian."},
       {"type": "INTERFACE", "text": "Celebración al terminar: confeti para quien gana, podio para el 2.º y el 3.º, y los marcadores saltan al sumar puntos. En los juegos por turnos, un aviso «¡Te toca!»."},
       {"type": "INTERFACE", "text": "Los colores de los jugadores ya no se confunden con el verde y el rojo de acierto y fallo, y las marcas importantes llevan además un icono o un texto, no solo el color."},
       {"type": "INTERFACE", "text": "En el móvil, el teclado ya no tapa el campo en el que escribes, los títulos largos bajan a dos líneas en vez de cortarse y al empezar una ronda la pantalla vuelve arriba."},
       {"type": "INTERFACE", "text": "Diez minijuegos estrenan la misma placa de ronda que el resto (ronda, fase, tiempo y controles de la sala en el mismo sitio)."},
       {"type": "IMPROVEMENTS", "text": "Lo que estabas escribiendo (el chat o una respuesta) no se pierde si recargas la página durante la ronda."},
       {"type": "IMPROVEMENTS", "text": "«Terminar sesión» pide confirmación, y si una pantalla no llega a cargar aparece un botón «Reintentar» en lugar de quedarse en blanco."},
       {"type": "IMPROVEMENTS", "text": "Con la sala vacía, la placa de jugadores ofrece copiar el enlace e invitar a tus amigos."},
       {"type": "BUGS", "text": "Trivia en el móvil: durante el revelado, la placa de abajo ya no tapa la última fila de cartas cuando la pregunta ocupa dos líneas."},
       {"type": "BUGS", "text": "Pokémon Impostor en el móvil: tu rol vuelve a verse al empezar cada ronda aunque hubieras bajado para votar."}
     ]$json$::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
