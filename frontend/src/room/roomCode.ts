import { OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from '../lib/realtime';

/** Longitud del código de sala (`roomCodeSchema`: `^[A-Z2-9]{6}$`). */
export const ROOM_CODE_LENGTH = 6;

/**
 * Código de sala tal y como lo espera el servidor: mayúsculas y solo `A-Z2-9`, seis como mucho. Si se pega un texto con
 * el código suelto («Código: PIKA42»), se queda con esa palabra; si no, quita lo demás (espacios, guiones, acentos).
 */
export function normalizeRoomCode(raw: string): string {
  const upper = raw.toUpperCase();
  const words = upper.match(/(?<![\p{L}\p{N}])[A-Z2-9]{6}(?![\p{L}\p{N}])/gu);
  // Se toma la última palabra de seis: en un mensaje compartido el código suele cerrar la frase («Únete a mi sala:
  // PIKA42»), y las palabras de seis letras que lo preceden («CODIGO» sin tilde, «ENTRAR»…) no son el código.
  if (words && upper.replace(/[^A-Z2-9]/g, '').length > ROOM_CODE_LENGTH) return words[words.length - 1]!;
  return upper.replace(/[^A-Z2-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

/** Patrón del código que el backend incluye en su error de validación (`RoomCommandParsers.roomCode`). */
export const ROOM_CODE_PATTERN = '/^[A-Z2-9]{6}$/';

/** Ficheros del backend de los que salen los textos que se reconocen aquí (los vigila `roomCode.test.ts`). */
export const SERVER_MESSAGE_SOURCES = {
  coordinator: 'backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java',
  parsers: 'backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCommandParsers.java',
  invitations: 'backend/src/main/java/es/pokemonuniverse/application/friends/RoomInvitations.java',
} as const;

const GENERIC = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';
const OTHER_ROOM = 'Ya estás en otra sala. Sal de ella antes de unirte a esta.';

/**
 * Mensajes en inglés del backend al crear, unirse o salir de una sala (`RoomException` en
 * backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java). Pasar a códigos de error queda fuera
 * de F3; mientras tanto, `roomCode.test.ts` lee esos ficheros Java y falla si un texto deja de aparecer.
 *
 * - «Room not found»: `RoomCoordinator.join`.
 * - «Room is full»: `RoomCoordinator.join`.
 * - «Leave your current room first»: `RoomCoordinator.join` (dos veces).
 * - «Already in a room»: `RoomCoordinator.create` (dos veces).
 * - «Not in a room»: `RoomCoordinator.requiredRoom` e `inRequiredRoom` (`leave` y otras órdenes sin sala).
 * - Del lobby: «This setting can only be changed in the lobby», «Player not found», «Unknown game», «Cannot end the
 *   session during a game» y «No game in progress».
 * - De partida y resultados: «You cannot act in the current game» y «Game has not finished».
 * - De empezar (`RoomCoordinator.startGame`): «Choose at least one game», con la selección de minijuegos vacía.
 * - De `room:invite` (`RoomInvitations.invite`): «You are not in a room», «Not a friend», «Friend is offline»,
 *   «Already in this room», «Room is full» (el mismo texto que `join`) e «Invitation already sent».
 */
export const ROOM_ERROR_TRANSLATIONS: Record<string, string> = {
  'Room not found': 'No hay ninguna sala con ese código. Revísalo con quien la creó.',
  'Room is full': 'La sala está llena.',
  'Leave your current room first': OTHER_ROOM,
  'Already in a room': OTHER_ROOM,
  'Not in a room': 'Ya no estás en ninguna sala.',
  // Órdenes del lobby (`RoomCoordinator`): ajustes, gestión de jugadores y fin de sesión.
  'This setting can only be changed in the lobby': 'Este ajuste solo se puede cambiar en el lobby.',
  'Player not found': 'Ese jugador ya no está en la sala.',
  'Unknown game': 'Ese minijuego no existe.',
  'Cannot end the session during a game': 'No se puede finalizar la sesión durante una partida.',
  'No game in progress': 'No hay ninguna partida en curso.',
  'Choose at least one game': 'Elige al menos un minijuego para empezar.',
  // Partida y resultados (`RoomCoordinator.action` y `returnLobby`): no salen del lobby, pero pasan por las mismas órdenes.
  'You cannot act in the current game': 'No puedes hacer eso en esta partida.',
  'Game has not finished': 'La partida todavía no ha terminado.',
  // Invitar a un amigo (`RoomInvitations.invite`).
  'You are not in a room': 'No estás en ninguna sala.',
  'Not a friend': 'Solo puedes invitar a tus amigos.',
  'Friend is offline': 'Tu amigo no está conectado.',
  'Already in this room': 'Ya está en tu sala.',
  'Invitation already sent': 'Ya le has invitado; espera unos segundos.',
};

/**
 * Textos en español del servidor que pasan tal cual: «Estás jugando en dos pestañas…»
 * (`RoomCoordinator.assertActiveSocket`) y «El servidor se está cerrando» (`RoomCoordinator.assertAcceptingCommands`).
 * Junto a los del cliente (`lib/realtime.ts`), forman los mensajes que no se traducen.
 */
export const SERVER_SPANISH_MESSAGES = ['Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.', 'El servidor se está cerrando'] as const;

const SPANISH = new Set<string>([OFFLINE_MESSAGE, TIMEOUT_MESSAGE, ...SERVER_SPANISH_MESSAGES]);

/** Texto en español para un error al crear, unirse o salir de una sala. */
export function roomErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  if (Object.hasOwn(ROOM_ERROR_TRANSLATIONS, raw)) return ROOM_ERROR_TRANSLATIONS[raw]!;
  if (SPANISH.has(raw)) return raw;
  // El error de validación del código llega como la lista de incidencias de Zod, con el patrón
  // `/^[A-Z2-9]{6}$/` (`RoomCommandParsers.roomCode`).
  if (raw.includes(ROOM_CODE_PATTERN)) return 'El código tiene 6 letras o números.';
  return GENERIC;
}

/** Palabras que delatan un texto en español del servidor (la mayoría de los rechazos del lobby ya llegan así). */
const SPANISH_HINT = /[áéíóúñü¿¡]|\b(?:el|la|los|las|de|del|que|un|una|ya|se|en|tu|al|por|para|con|hay|puedes|jugador|jugadores|minijuego|minijuegos|sala|partida|host)\b/i;

/**
 * Texto en español para un error de una orden de la sala (lobby: listo, empezar, ajustes, roles). A diferencia de
 * `roomErrorMessage`, deja pasar los rechazos del servidor que ya están en español («Falta por confirmar: …», «No tienes
 * permiso…», «Pokémon Impostor: …»), porque explican qué falta. Traduce los conocidos en inglés y lo demás (incidencias
 * de validación, «Action rejected», errores sin texto) se queda en el genérico.
 */
export function roomActionErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  if (Object.hasOwn(ROOM_ERROR_TRANSLATIONS, raw)) return ROOM_ERROR_TRANSLATIONS[raw]!;
  if (SPANISH.has(raw)) return raw;
  // Las incidencias de validación llegan como JSON (`ZodIssues.stringify`): no son para leer.
  if (!raw || raw.startsWith('[') || raw.startsWith('{')) return GENERIC;
  return SPANISH_HINT.test(raw) ? raw : GENERIC;
}
