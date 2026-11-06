-- Notas de parche 0.6.0: lo publicado desde la 0.5.0 (5 y 6 de noviembre de 2026), escrito para los jugadores a partir
-- del historial de git. Se inserta ya publicada; si la versión ya existe (escrita a mano desde Administración), se
-- respeta la que hay. "highlight" solo aparece cuando es true, como lo guarda ChangelogChange.
INSERT INTO public."Changelog" (id, version, title, summary, date, published, content, "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, '0.6.0', 'Amigos, modos de juego y logros',
     'Añade amigos e invítalos a tu sala, prueba seis modos de juego nuevos, desbloquea 48 logros y recupera tu contraseña por email.',
     TIMESTAMP '2026-11-06 15:00:00', true,
     $json$[
       {"type": "NEW", "text": "Amigos: envía solicitudes por nombre de usuario (también desde «Gestionar» en la sala), mira quién está conectado e invítalos a tu lobby con un aviso que pueden aceptar desde cualquier página.", "highlight": true},
       {"type": "NEW", "text": "48 logros: hitos generales, uno o dos por minijuego y algunos secretos. Te avisamos al acabar la partida y los tienes todos en la pestaña «Logros» de tu perfil.", "highlight": true},
       {"type": "NEW", "text": "Seis modos de juego nuevos, elegibles en los ajustes de cada juego: Pokédex Distance «Por puntos», Higher or Lower «Racha infinita», Shiny Quiz «Supervivencia», Learnset Guess «Revelación manual», Type Duel «Cooperativo» y Pokémon Impostor «Una palabra».", "highlight": true},
       {"type": "NEW", "text": "¿Olvidaste la contraseña? Pide un enlace a tu email y elige una nueva. Además, puedes entrar con tu nombre de usuario o con tu email."},
       {"type": "NEW", "text": "Récord personal de la Racha infinita de Higher or Lower en tus estadísticas."},
       {"type": "NEW", "text": "Únete al Discord oficial desde el botón de la portada."},
       {"type": "MINIGAMES", "text": "Todos los minijuegos admiten hasta 8 jugadores."},
       {"type": "MINIGAMES", "text": "Pokémon Connections: cada puzle es aleatorio, con 47 categorías nuevas (tipos, habilidades, iniciales del nombre, tamaño…), nunca dos del mismo estilo en un tablero y sin las de color oficial."},
       {"type": "MINIGAMES", "text": "Juegos de adivinar: nuevo ajuste «Intentos públicos» para ocultar los fallos de los demás."},
       {"type": "MINIGAMES", "text": "Pokémon Impostor: con varios impostores, cada uno ve a sus compañeros, y una pista ya no puede contener el nombre del Pokémon."},
       {"type": "BALANCE", "text": "Type Duel Cooperativo cuenta como partida jugada, pero tu porcentaje de victorias solo usa las partidas con ganador."},
       {"type": "INTERFACE", "text": "En el lobby puedes quitar el último minijuego elegido, las cartas tienen el mismo alto y muestran «+N jugadores». Al acabar la sesión, «Volver al lobby»."},
       {"type": "INTERFACE", "text": "Juegos de adivinar: el buscador recibe el foco al empezar cada ronda y la lista de intentos públicos ya no encoge el marcador."},
       {"type": "INTERFACE", "text": "Recuento de votos más claro en ¿Quién es el fake?, Más probable, Red Flag y Qué prefieres: cada voto es un avatar, el número de votos se ve grande y cada fila cabe en una línea."},
       {"type": "INTERFACE", "text": "La pestaña Invitado explica las ventajas de crear una cuenta."},
       {"type": "IMPROVEMENTS", "text": "Si abres la sala en otra pestaña, ya no te quita el asiento: sigues jugando donde estabas y la otra te avisa."},
       {"type": "BUGS", "text": "Pokédle Race: la etapa evolutiva solo cuenta las generaciones de la partida (Pikachu es 1/2 en 1.ª generación) y el verde exige la misma etapa y el mismo total."},
       {"type": "BUGS", "text": "¿Quién es el fake?: la última carta en revelarse también se da la vuelta con su animación."},
       {"type": "BUGS", "text": "Los errores de una sala ya no te siguen al salir de ella."}
     ]$json$::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
