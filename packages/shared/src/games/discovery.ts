import type { GameDiscoveryMetadata } from './contracts.js';

const commonGuess = [
  'Configura las rondas y el conjunto de Pokémon.',
  'Observa cada pista y envía tu respuesta antes de que termine el tiempo.',
  'Suma más puntos acertando pronto y con pocos intentos.',
] as const;

export const gameDiscoveryMetadata: Readonly<Record<string, GameDiscoveryMetadata>> = {
  'pokedex-distance': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 5, howToPlay: ['Se muestra un número objetivo de la Pokédex.', 'Cada jugador elige un Pokémon.', 'Gana quien se acerque más al número objetivo.'] },
  'shiny-vote': { categories: ['GUESSING', 'COMPETITIVE'], estimatedMinutes: 5, howToPlay: ['Observa las opciones de cada ronda.', 'Elige cuál muestra el shiny auténtico.', 'Encadena aciertos para liderar la clasificación.'] },
  'pokemon-impostor': { categories: ['SOCIAL', 'TEAMS'], estimatedMinutes: 10, howToPlay: ['Casi todos reciben el mismo Pokémon; el impostor recibe información distinta.', 'Da pistas sin revelar demasiado.', 'Debatid y votad quién es el impostor.'] },
  'higher-lower': { categories: ['GUESSING', 'KNOWLEDGE'], estimatedMinutes: 5, howToPlay: ['Compara la estadística visible con la del siguiente Pokémon.', 'Decide si será mayor o menor.', 'Mantén tu racha de respuestas correctas.'] },
  'type-duel': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 8, howToPlay: ['Selecciona tipos para preparar el duelo.', 'Busca Pokémon que cumplan las condiciones.', 'Gana rondas aprovechando mejor las relaciones de tipos.'] },
  'learnset-guess': { categories: ['GUESSING', 'KNOWLEDGE'], estimatedMinutes: 6, howToPlay: commonGuess },
  'pokeddle-race': { categories: ['GUESSING', 'COMPETITIVE'], estimatedMinutes: 8, howToPlay: ['Adivina el Pokémon secreto con intentos sucesivos.', 'Usa el color de cada atributo para acercarte.', 'Resuélvelo antes que el resto de jugadores.'] },
  'pokemon-bingo': { categories: ['GUESSING', 'COMPETITIVE'], estimatedMinutes: 8, howToPlay: ['Completa Pokémon que cumplan las pistas de tu cartón.', 'Cada respuesta válida marca una casilla.', 'Consigue una línea o el patrón configurado antes que nadie.'], newRelease: true },
  'whos-that-pokemon': { categories: ['GUESSING'], estimatedMinutes: 5, howToPlay: commonGuess },
  'pokedex-entry-guess': { categories: ['GUESSING', 'KNOWLEDGE'], estimatedMinutes: 6, howToPlay: ['Lee una entrada de Pokédex parcialmente oculta.', 'Usa sus detalles como pistas.', 'Adivina el Pokémon antes de que termine la ronda.'] },
  'type-chain': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 8, howToPlay: ['Responde por turnos con un Pokémon válido.', 'El nuevo Pokémon debe enlazar con el tipo indicado.', 'Evita repetir respuestas y sobrevivirás a la cadena.'] },
  'guess-from-stats': { categories: ['GUESSING', 'KNOWLEDGE'], estimatedMinutes: 6, howToPlay: commonGuess },
  'zoomed-pokemon': { categories: ['GUESSING'], estimatedMinutes: 5, howToPlay: ['Observa un fragmento ampliado del Pokémon.', 'Espera nuevas pistas o responde cuanto antes.', 'Los aciertos rápidos otorgan más puntos.'] },
  'poke-taboo': { categories: ['SOCIAL', 'TEAMS'], estimatedMinutes: 10, howToPlay: ['Describe el Pokémon a tu equipo.', 'No uses las palabras prohibidas de la tarjeta.', 'Consigue tantos aciertos como puedas en tu turno.'] },
  'one-of-us-is-fake': { categories: ['SOCIAL'], estimatedMinutes: 10, howToPlay: ['Cada jugador elige una respuesta para la categoría.', 'Una respuesta puede pertenecer al infiltrado.', 'Debatid y descubrid quién no encaja.'] },
  'pokemon-bluff-auction': { categories: ['SOCIAL', 'KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 12, howToPlay: ['Escucha la afirmación sobre el lote.', 'Puja si crees que puedes demostrarla o deja que otro se arriesgue.', 'Equilibra conocimiento, farol y presupuesto.'] },
  'sketchmon': { categories: ['DRAWING', 'SOCIAL', 'TEAMS'], estimatedMinutes: 12, howToPlay: ['Dibuja el Pokémon asignado sin escribir su nombre.', 'Tu equipo intenta adivinarlo.', 'Los aciertos antes del tiempo suman puntos.'] },
  'pokemon-connections': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 8, howToPlay: ['Encuentra grupos de Pokémon con una conexión común.', 'Selecciona un grupo completo para comprobarlo.', 'Resuelve todas las conexiones con pocos errores.'] },
  'pokemon-team-auction': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 12, howToPlay: ['Administra tus monedas durante la subasta.', 'Puja por Pokémon que mejoren tu equipo.', 'La plantilla final determina la puntuación.'] },
  'secret-ranking': { categories: ['SOCIAL'], estimatedMinutes: 10, howToPlay: ['Una persona ordena en secreto sus opciones.', 'El grupo intenta reconstruir ese orden.', 'Comparad el resultado cuando se revele el ranking.'] },
  'most-likely-to': { categories: ['SOCIAL'], estimatedMinutes: 8, howToPlay: ['Lee la pregunta de la ronda.', 'Vota qué jugador encaja mejor.', 'Descubre el resultado cuando todo el mundo haya votado.'] },
  'would-you-rather': { categories: ['SOCIAL'], estimatedMinutes: 8, howToPlay: ['Elige entre las dos opciones Pokémon.', 'Comenta tu elección con el grupo.', 'Descubre cómo se divide la sala.'] },
  'pokemon-red-flag': { categories: ['SOCIAL'], estimatedMinutes: 10, howToPlay: ['Construye una propuesta con cualidades atractivas.', 'Añade una red flag que la complique.', 'El grupo vota la combinación ganadora.'] },
  'tcg-higher-lower': { categories: ['GUESSING', 'KNOWLEDGE'], estimatedMinutes: 5, howToPlay: ['Observa la carta y su precio de referencia.', 'Decide si la siguiente vale más o menos.', 'Mantén la racha para sumar puntos.'] },
  'pokemon-cry-quiz': { categories: ['AUDIO', 'GUESSING'], estimatedMinutes: 5, howToPlay: ['Escucha el grito reproducido por el servidor.', 'Busca y envía el Pokémon correcto.', 'Responde rápido para conseguir más puntos.'], newRelease: true },
  'pokemon-trivia': { categories: ['KNOWLEDGE', 'COMPETITIVE'], estimatedMinutes: 6, howToPlay: ['Lee la pregunta y sus posibles respuestas.', 'Elige antes de que termine el tiempo.', 'La clasificación suma tus aciertos de todas las rondas.'] },
  'pokemon-palette-guess': { categories: ['GUESSING'], estimatedMinutes: 5, howToPlay: ['Reconoce al Pokémon a partir de su paleta de colores.', 'Usa las pistas opcionales si las necesitas.', 'Acierta con pocos intentos para sumar más.'], newRelease: true },
  'who-is-who-pokemon': { categories: ['KNOWLEDGE', 'TEAMS'], estimatedMinutes: 12, howToPlay: ['Cada equipo recibe un Pokémon secreto.', 'Descarta candidatos haciendo preguntas al equipo rival.', 'Adivina el secreto contrario antes que el otro equipo.'], newRelease: true },
};

export function discoveryMetadataFor(gameId: string): GameDiscoveryMetadata {
  return gameDiscoveryMetadata[gameId] ?? {
    categories: ['SOCIAL'],
    estimatedMinutes: 10,
    howToPlay: ['Configura la partida.', 'Sigue las instrucciones de cada ronda.', 'Compara el resultado con tus amigos.'],
  };
}
