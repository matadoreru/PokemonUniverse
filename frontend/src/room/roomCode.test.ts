import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from '../lib/realtime';
import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, ROOM_ERROR_TRANSLATIONS, SERVER_MESSAGE_SOURCES, SERVER_SPANISH_MESSAGES, normalizeRoomCode, roomErrorMessage } from './roomCode';

/** Fuente Java del backend, leída desde la raíz del repositorio. */
function javaSource(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('normalizeRoomCode', () => {
  it('pasa a mayúsculas', () => {
    expect(normalizeRoomCode('pika42')).toBe('PIKA42');
  });
  it('quita espacios, guiones y signos de un pegado', () => {
    expect(normalizeRoomCode(' PIKA-42 ')).toBe('PIKA42');
    expect(normalizeRoomCode('pi ka 4 2')).toBe('PIKA42');
  });
  it('descarta lo que no admite el código (0, 1, acentos, ñ)', () => {
    expect(normalizeRoomCode('ñA0B1C')).toBe('ABC');
    expect(normalizeRoomCode('ÁBCD23')).toBe('BCD23');
  });
  it('corta a seis caracteres', () => {
    expect(normalizeRoomCode('ABCDEFGH')).toBe('ABCDEF');
    expect(normalizeRoomCode('ABCDEFGH')).toHaveLength(ROOM_CODE_LENGTH);
  });
  it('de un texto pegado con el código suelto se queda con el código', () => {
    expect(normalizeRoomCode('Código: PIKA42')).toBe('PIKA42');
    expect(normalizeRoomCode('entra en la sala zxcv78 ya')).toBe('ZXCV78');
  });
  it('vacío sigue vacío', () => {
    expect(normalizeRoomCode('')).toBe('');
    expect(normalizeRoomCode('  -- ')).toBe('');
  });
});

describe('roomErrorMessage', () => {
  it('traduce los errores en inglés del servidor', () => {
    expect(roomErrorMessage(new Error('Room not found'))).toBe('No hay ninguna sala con ese código. Revísalo con quien la creó.');
    expect(roomErrorMessage(new Error('Room is full'))).toBe('Esa sala está llena.');
    expect(roomErrorMessage(new Error('Leave your current room first'))).toMatch(/^Ya estás en otra sala/);
    expect(roomErrorMessage(new Error('Already in a room'))).toMatch(/^Ya estás en otra sala/);
    expect(roomErrorMessage(new Error('Not in a room'))).toBe('Ya no estás en ninguna sala.');
  });
  it('el error de formato del código (Zod) se explica en español', () => {
    const zod = JSON.stringify([{ origin: 'string', code: 'invalid_format', format: 'regex', pattern: '/^[A-Z2-9]{6}$/', path: [], message: 'Invalid string: must match pattern /^[A-Z2-9]{6}$/' }]);
    expect(roomErrorMessage(new Error(zod))).toBe('El código tiene 6 letras o números.');
  });
  it('deja pasar los mensajes del cliente que ya están en español', () => {
    expect(roomErrorMessage(new Error(OFFLINE_MESSAGE))).toBe(OFFLINE_MESSAGE);
    expect(roomErrorMessage(new Error(TIMEOUT_MESSAGE))).toBe(TIMEOUT_MESSAGE);
    expect(roomErrorMessage('Esta conexión ha sido reemplazada por una sesión más reciente.')).toBe('Esta conexión ha sido reemplazada por una sesión más reciente.');
  });
  it('lo desconocido da un texto genérico en español', () => {
    expect(roomErrorMessage(new Error('Internal Server Error'))).toBe('No se pudo completar. Inténtalo de nuevo en unos segundos.');
    expect(roomErrorMessage(null)).toBe('No se pudo completar. Inténtalo de nuevo en unos segundos.');
  });
});

describe('textos del servidor vigilados', () => {
  // Si el backend cambia uno de estos textos, la traducción dejaría de aplicarse en silencio: este test lo detecta.
  const coordinator = javaSource(SERVER_MESSAGE_SOURCES.coordinator);
  it.each(Object.keys(ROOM_ERROR_TRANSLATIONS))('«%s» sigue saliendo de RoomCoordinator.java', (message) => {
    expect(coordinator).toContain(`new RoomException("${message}")`);
  });
  it.each([...SERVER_SPANISH_MESSAGES])('«%s» sigue saliendo de RoomCoordinator.java', (message) => {
    expect(coordinator).toContain(`new RoomException("${message}")`);
  });
  it('el patrón del código sigue en el error de validación de RoomCommandParsers.java', () => {
    expect(javaSource(SERVER_MESSAGE_SOURCES.parsers)).toContain(`issues.invalidFormat("regex", "${ROOM_CODE_PATTERN}"`);
  });
});
