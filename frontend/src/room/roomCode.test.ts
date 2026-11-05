import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from '../lib/realtime';
import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, ROOM_ERROR_TRANSLATIONS, SERVER_MESSAGE_SOURCES, SERVER_SPANISH_MESSAGES, normalizeRoomCode, roomActionErrorMessage, roomErrorMessage } from './roomCode';

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
    expect(roomErrorMessage(new Error('Room is full'))).toBe('La sala está llena.');
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
    expect(roomErrorMessage('Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.')).toBe('Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.');
  });
  it('lo desconocido da un texto genérico en español', () => {
    expect(roomErrorMessage(new Error('Internal Server Error'))).toBe('No se pudo completar. Inténtalo de nuevo en unos segundos.');
    expect(roomErrorMessage(null)).toBe('No se pudo completar. Inténtalo de nuevo en unos segundos.');
  });
});

describe('errores de room:invite', () => {
  it.each([
    ['You are not in a room', 'No estás en ninguna sala.'],
    ['Not a friend', 'Solo puedes invitar a tus amigos.'],
    ['Friend is offline', 'Tu amigo no está conectado.'],
    ['Already in this room', 'Ya está en tu sala.'],
    ['Room is full', 'La sala está llena.'],
    ['Invitation already sent', 'Ya le has invitado; espera unos segundos.'],
  ])('«%s» se traduce', (message, spanish) => {
    expect(roomErrorMessage(new Error(message))).toBe(spanish);
    expect(roomActionErrorMessage(new Error(message))).toBe(spanish);
  });
});

describe('roomActionErrorMessage', () => {
  it('deja pasar los rechazos del lobby que ya están en español', () => {
    expect(roomActionErrorMessage(new Error('Falta por confirmar: Ana.'))).toBe('Falta por confirmar: Ana.');
    expect(roomActionErrorMessage(new Error('No tienes permiso para realizar esta acción.'))).toBe('No tienes permiso para realizar esta acción.');
    expect(roomActionErrorMessage(new Error('Pokémon Impostor: Demasiados impostores'))).toBe('Pokémon Impostor: Demasiados impostores');
    expect(roomActionErrorMessage(new Error('Jugador no encontrado.'))).toBe('Jugador no encontrado.');
    expect(roomActionErrorMessage(new Error(OFFLINE_MESSAGE))).toBe(OFFLINE_MESSAGE);
  });
  it('traduce los del servidor en inglés', () => {
    expect(roomActionErrorMessage(new Error('This setting can only be changed in the lobby'))).toBe('Este ajuste solo se puede cambiar en el lobby.');
    expect(roomActionErrorMessage(new Error('Player not found'))).toBe('Ese jugador ya no está en la sala.');
    expect(roomActionErrorMessage(new Error('Not in a room'))).toBe('Ya no estás en ninguna sala.');
    expect(roomActionErrorMessage('Cannot end the session during a game')).toBe('No se puede finalizar la sesión durante una partida.');
    expect(roomActionErrorMessage(new Error('Game has not finished'))).toBe('La partida todavía no ha terminado.');
    expect(roomActionErrorMessage(new Error('You cannot act in the current game'))).toBe('No puedes hacer eso en esta partida.');
  });
  it('las incidencias de validación, lo desconocido en inglés y lo vacío dan el genérico', () => {
    const generic = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';
    expect(roomActionErrorMessage(new Error(JSON.stringify([{ code: 'too_big', path: ['impostorCount'], message: 'Too big' }])))).toBe(generic);
    expect(roomActionErrorMessage(new Error('Action rejected'))).toBe(generic);
    expect(roomActionErrorMessage(new Error('Internal Server Error'))).toBe(generic);
    expect(roomActionErrorMessage(null)).toBe(generic);
  });
});

describe('textos del servidor vigilados', () => {
  // Si el backend cambia uno de estos textos, la traducción dejaría de aplicarse en silencio: este test lo detecta.
  const coordinator = javaSource(SERVER_MESSAGE_SOURCES.coordinator);
  const invitations = javaSource(SERVER_MESSAGE_SOURCES.invitations);
  it.each(Object.keys(ROOM_ERROR_TRANSLATIONS))('«%s» sigue saliendo de RoomCoordinator.java o RoomInvitations.java', (message) => {
    expect(coordinator + invitations).toContain(`new RoomException("${message}")`);
  });
  it.each([...SERVER_SPANISH_MESSAGES])('«%s» sigue saliendo de RoomCoordinator.java', (message) => {
    expect(coordinator).toContain(`new RoomException("${message}")`);
  });
  it('el patrón del código sigue en el error de validación de RoomCommandParsers.java', () => {
    expect(javaSource(SERVER_MESSAGE_SOURCES.parsers)).toContain(`issues.invalidFormat("regex", "${ROOM_CODE_PATTERN}"`);
  });
});
