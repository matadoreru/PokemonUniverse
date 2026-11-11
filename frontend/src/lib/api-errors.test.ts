import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { apiErrorMessage, errorStatus, errorText, GENERIC_MESSAGE, isNetworkError, looksSpanish, NETWORK_MESSAGE, statusMessage } from './api-errors';

describe('errorText', () => {
  it('saca el texto de un Error o de un texto, sin espacios; lo demás da vacío', () => {
    expect(errorText(new Error('  Hola  '))).toBe('Hola');
    expect(errorText(' Room not found ')).toBe('Room not found');
    expect(errorText(null)).toBe('');
    expect(errorText({ message: 'x' })).toBe('');
  });
});

describe('isNetworkError', () => {
  it('reconoce el fallo de red de `api()` y los mensajes de Chromium, Safari y Firefox', () => {
    expect(isNetworkError(new ApiError('lo que sea', { network: true }))).toBe(true);
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError('Load failed')).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
  });

  it('un error del servidor o un TypeError cualquiera no son de red', () => {
    expect(isNetworkError(new ApiError('Internal server error', { status: 500 }))).toBe(false);
    expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
});

describe('errorStatus', () => {
  it('da el código de un ApiError y nada para lo demás', () => {
    expect(errorStatus(new ApiError('x', { status: 404 }))).toBe(404);
    expect(errorStatus(new Error('x'))).toBeUndefined();
  });
});

describe('looksSpanish', () => {
  it.each([
    'Ya tienes una pareja igual o equivalente.',
    'Escribe al menos 4 caracteres.',
    'Las dos opciones deben ser diferentes.',
    'Pareja no encontrada.',
    'Puedes importar hasta 100 dilemas cada vez.',
    'El JSON contiene dilemas duplicados o invertidos.',
    'Pokémon Impostor: Demasiados impostores',
    'Pokémon desconocido.',
  ])('«%s» está en español', (text) => {
    expect(looksSpanish(text)).toBe(true);
  });

  it.each([
    'Internal server error',
    'Too many requests',
    'Authentication required',
    'Email or username already in use',
    'Invalid request',
    'Request failed',
    'Daily challenge unavailable: the Pokémon catalog is empty',
    'The selected generations have no Pokémon',
    'Pokémon is not in the configured pool',
    'Results are unavailable before Pokédex Absurda finishes',
    'PokéAPI request failed',
    'PokéAPI',
    '[{"code":"too_big","message":"Too big"}]',
    '',
  ])('«%s» no está en español', (text) => {
    expect(looksSpanish(text)).toBe(false);
  });
});

describe('statusMessage', () => {
  it('tiene una frase en español para los códigos que dicen algo al usuario', () => {
    for (const status of [401, 403, 404, 409, 413, 429, 500, 502, 503]) expect(statusMessage(status), String(status)).toMatch(/[a-z]/);
    expect(statusMessage(429)).toBe('Demasiadas peticiones seguidas. Espera unos segundos y vuelve a probar.');
    expect(statusMessage(400)).toBeNull();
    expect(statusMessage(undefined)).toBeNull();
  });
});

describe('apiErrorMessage', () => {
  it('va por orden: traducción, red, español del servidor, código HTTP y reserva', () => {
    const translations = { 'Too many requests': 'Para un momento.' };
    expect(apiErrorMessage(new ApiError('Too many requests', { status: 429 }), { translations })).toBe('Para un momento.');
    expect(apiErrorMessage(new ApiError('Failed to fetch', { network: true }))).toBe(NETWORK_MESSAGE);
    expect(apiErrorMessage(new ApiError('Escribe al menos 4 caracteres.', { status: 400 }))).toBe('Escribe al menos 4 caracteres.');
    expect(apiErrorMessage(new ApiError('Internal server error', { status: 500 }))).toBe('El servidor ha tenido un problema. Inténtalo de nuevo en unos segundos.');
    expect(apiErrorMessage(new ApiError('Invalid JSON', { status: 400 }), { fallback: 'No se pudo guardar.' })).toBe('No se pudo guardar.');
    expect(apiErrorMessage(undefined)).toBe(GENERIC_MESSAGE);
  });

  it('con un texto de reserva propio, solo 401, 403 y 429 usan la frase del código', () => {
    const fallback = 'No se pudo cargar el catálogo TCG.';
    for (const status of [404, 409, 413, 500, 503]) expect(apiErrorMessage(new ApiError('Internal server error', { status }), { fallback }), String(status)).toBe(fallback);
    expect(apiErrorMessage(new ApiError('Too many requests', { status: 429 }), { fallback })).toBe(statusMessage(429));
    expect(apiErrorMessage(new ApiError('Authentication required', { status: 401 }), { fallback })).toBe(statusMessage(401));
    expect(apiErrorMessage(new ApiError('Forbidden', { status: 403 }), { fallback })).toBe(statusMessage(403));
  });

  it('nunca enseña inglés, ni siquiera sin código', () => {
    for (const raw of ['Internal server error', 'Too many requests', 'Email or username already in use', 'Request failed', 'Authentication required']) {
      expect(apiErrorMessage(new Error(raw), { fallback: 'Reserva.' }), raw).toBe('Reserva.');
    }
  });

  it('cada pantalla puede cambiar el texto de red y apagar el español o el código HTTP', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'), { network: 'Sin red.' })).toBe('Sin red.');
    expect(apiErrorMessage(new Error('Escribe al menos 4 caracteres.'), { spanish: false, fallback: 'Reserva.' })).toBe('Reserva.');
    expect(apiErrorMessage(new ApiError('Internal server error', { status: 500 }), { status: false, fallback: 'Reserva.' })).toBe('Reserva.');
  });
});
