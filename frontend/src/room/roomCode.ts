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
  if (words && upper.replace(/[^A-Z2-9]/g, '').length > ROOM_CODE_LENGTH) return words[words.length - 1]!;
  return upper.replace(/[^A-Z2-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

const GENERIC = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';
const OTHER_ROOM = 'Ya estás en otra sala. Sal de ella antes de unirte a esta.';

/** Mensajes en inglés del `RoomCoordinator` al crear, unirse o salir. */
const TRANSLATED: Record<string, string> = {
  'Room not found': 'No hay ninguna sala con ese código. Revísalo con quien la creó.',
  'Room is full': 'Esa sala está llena.',
  'Leave your current room first': OTHER_ROOM,
  'Already in a room': OTHER_ROOM,
  'Not in a room': 'Ya no estás en ninguna sala.',
};

/** Mensajes que ya llegan en español (del cliente o del servidor) y pasan tal cual. */
const SPANISH = new Set([
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  'Esta conexión ha sido reemplazada por una sesión más reciente.',
  'El servidor se está cerrando',
]);

/** Texto en español para un error al crear, unirse o salir de una sala. */
export function roomErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  if (Object.hasOwn(TRANSLATED, raw)) return TRANSLATED[raw]!;
  if (SPANISH.has(raw)) return raw;
  // El error de validación del código llega como la lista de incidencias de Zod.
  if (raw.includes('A-Z2-9')) return 'El código tiene 6 letras o números.';
  return GENERIC;
}
