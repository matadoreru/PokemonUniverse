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

/** Patrón del código que el backend incluye en su error de validación (RoomCommandParsers.java:51). */
export const ROOM_CODE_PATTERN = '/^[A-Z2-9]{6}$/';

/** Ficheros del backend de los que salen los textos que se reconocen aquí (los vigila `roomCode.test.ts`). */
export const SERVER_MESSAGE_SOURCES = {
  coordinator: 'backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java',
  parsers: 'backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCommandParsers.java',
} as const;

const GENERIC = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';
const OTHER_ROOM = 'Ya estás en otra sala. Sal de ella antes de unirte a esta.';

/**
 * Mensajes en inglés del backend al crear, unirse o salir de una sala (`RoomException` en
 * backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java). Pasar a códigos de error queda fuera
 * de F3; mientras tanto, `roomCode.test.ts` lee esos ficheros Java y falla si un texto deja de aparecer.
 *
 * - «Room not found»: RoomCoordinator.java:308 (`join`).
 * - «Room is full»: RoomCoordinator.java:313 (`join`).
 * - «Leave your current room first»: RoomCoordinator.java:306 y :315 (`join`).
 * - «Already in a room»: RoomCoordinator.java:260 y :287 (`create`).
 * - «Not in a room»: RoomCoordinator.java:1437 y :1546 (`leave` y otras órdenes sin sala).
 */
export const ROOM_ERROR_TRANSLATIONS: Record<string, string> = {
  'Room not found': 'No hay ninguna sala con ese código. Revísalo con quien la creó.',
  'Room is full': 'Esa sala está llena.',
  'Leave your current room first': OTHER_ROOM,
  'Already in a room': OTHER_ROOM,
  'Not in a room': 'Ya no estás en ninguna sala.',
};

/**
 * Mensajes que ya llegan en español y pasan tal cual: los del cliente (`lib/realtime.ts`) y dos del servidor,
 * «Esta conexión ha sido reemplazada…» (RoomCoordinator.java:238) y «El servidor se está cerrando»
 * (RoomCoordinator.java:209).
 */
/** Textos en español del servidor que pasan tal cual. */
export const SERVER_SPANISH_MESSAGES = ['Esta conexión ha sido reemplazada por una sesión más reciente.', 'El servidor se está cerrando'] as const;

const SPANISH = new Set<string>([OFFLINE_MESSAGE, TIMEOUT_MESSAGE, ...SERVER_SPANISH_MESSAGES]);

/** Texto en español para un error al crear, unirse o salir de una sala. */
export function roomErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  if (Object.hasOwn(ROOM_ERROR_TRANSLATIONS, raw)) return ROOM_ERROR_TRANSLATIONS[raw]!;
  if (SPANISH.has(raw)) return raw;
  // El error de validación del código llega como la lista de incidencias de Zod, con el patrón
  // `/^[A-Z2-9]{6}$/` (RoomCommandParsers.java:51, `roomCode`).
  if (raw.includes(ROOM_CODE_PATTERN)) return 'El código tiene 6 letras o números.';
  return GENERIC;
}
