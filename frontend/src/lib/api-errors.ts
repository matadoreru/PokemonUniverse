/**
 * Errores de la API en español. El backend manda en `error` textos en inglés («Too many requests», «Internal server
 * error», «Authentication required»…) o ya en español (las validaciones), y el navegador los suyos cuando falla la red.
 * Aquí está lo común: el texto crudo, si es un fallo de red, si ya está en español y la frase de cada código HTTP. Cada
 * pantalla añade solo su mapa de traducciones y su texto de reserva. Un texto en inglés nunca se enseña tal cual.
 */

export const NETWORK_MESSAGE = 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
export const GENERIC_MESSAGE = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';

/** Mensaje crudo de un error (un `Error`, un texto o cualquier otra cosa, que da `''`), sin espacios en los extremos. */
export function errorText(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  return '';
}

/** Mensajes de `fetch` cuando la petición no llega: Chromium, Safari y Firefox. */
const NETWORK_TEXTS = new Set(['Failed to fetch', 'Load failed']);

/**
 * `true` si la petición no llegó al servidor: un `ApiError` con `network` (sin importarlo, para que los tests que
 * simulan `lib/api` sigan valiendo) o el mensaje de red de un navegador.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error && (error as { network?: unknown }).network === true) return true;
  const raw = errorText(error);
  return NETWORK_TEXTS.has(raw) || raw.startsWith('NetworkError');
}

/** Código HTTP de un `ApiError`, si lo trae. */
export function errorStatus(error: unknown): number | undefined {
  const status = error instanceof Error ? (error as { status?: unknown }).status : undefined;
  return typeof status === 'number' ? status : undefined;
}

/** Pistas de un texto en español: letras propias o palabras que no existen en inglés. */
const SPANISH_HINT = /[áéíóúñü¿¡]|\b(?:el|la|los|las|de|del|que|un|una|ya|se|en|tu|al|por|para|con|sin|hay|puedes|jugador|jugadores|minijuego|minijuegos|sala|partida|desconocid[oa]s?)\b|\bno (?:es|está|están|hay|puede|puedes|pueden|se|tiene|tienes|encontrad[oa]s?|disponible)\b/i;
const POKEMON_WORD = /Pok[ée](?:mon|dex|API)/g;
/** Palabras de los textos en inglés del servidor, para cuando la única pista es la «é» de «Pokémon». */
const ENGLISH_HINT = /\b(?:the|is|are|not|has|have|must|cannot|can|only|you|your|this|that|already|invalid|unknown|missing|failed|required|too|found|unavailable|does|before|after|empty|error|request|from|with|of|to)\b/i;

/**
 * `true` si el texto del servidor ya está en español y se puede enseñar tal cual. «Pokémon», «Pokédex» y «PokéAPI» no cuentan como
 * pista, porque también salen en inglés («The Pokémon catalog…»): un texto cuya única pista son ellas pasa solo si no
 * tiene palabras inglesas («Pokémon Impostor: Demasiados impostores»).
 */
export function looksSpanish(text: string): boolean {
  const raw = text.trim();
  // Las incidencias de validación llegan como JSON (`ZodIssues.stringify`): no son para leer.
  if (!raw || raw.startsWith('[') || raw.startsWith('{')) return false;
  if (SPANISH_HINT.test(raw.replace(POKEMON_WORD, ''))) return true;
  // Sin `g` (`test` con una regex global guarda `lastIndex`) y sin «PokéAPI», que nunca es pista de español.
  return /Poké(?:mon|dex)/.test(raw) && !ENGLISH_HINT.test(raw.replace(POKEMON_WORD, ''));
}

/** Frase en español para un código HTTP sin texto propio, o `null` si el código no dice nada útil al usuario. */
export function statusMessage(status: number | undefined): string | null {
  if (status === undefined) return null;
  if (status === 401) return 'Tu sesión ha caducado. Vuelve a entrar y prueba otra vez.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'No se encontró lo que buscabas. Puede que ya no exista.';
  if (status === 409) return 'Ese cambio choca con otro que ya existe. Recarga y vuelve a probar.';
  if (status === 413) return 'El envío es demasiado grande.';
  if (status === 429) return 'Demasiadas peticiones seguidas. Espera unos segundos y vuelve a probar.';
  if (status >= 500) return 'El servidor ha tenido un problema. Inténtalo de nuevo en unos segundos.';
  return null;
}

export interface ApiErrorMessageOptions {
  /** Traducciones exactas de los textos en inglés que conoce la pantalla; van antes que todo lo demás. */
  translations?: Readonly<Record<string, string>>;
  /** Texto para un fallo de red (por omisión, `NETWORK_MESSAGE`). */
  network?: string;
  /** Si un texto del servidor que ya está en español pasa tal cual (por omisión, sí). */
  spanish?: boolean;
  /**
   * Si un error sin traducción usa la frase de su código HTTP (por omisión, sí). Con un `fallback` propio de la pantalla,
   * solo la de 401, 403 y 429, que dicen al usuario qué hacer; el resto (404, 5xx…) cede ante ese texto.
   */
  status?: boolean;
  /** Texto de reserva (por omisión, `GENERIC_MESSAGE`). */
  fallback?: string;
}

/**
 * Texto en español para un error de `api()`: la traducción de la pantalla, el de red, el del servidor si ya está en
 * español, la frase del código HTTP o el de reserva, por ese orden.
 */
export function apiErrorMessage(error: unknown, options: ApiErrorMessageOptions = {}): string {
  const raw = errorText(error);
  const { translations, network = NETWORK_MESSAGE, spanish = true, status = true } = options;
  const fallback = options.fallback ?? GENERIC_MESSAGE;
  if (translations && Object.hasOwn(translations, raw)) return translations[raw]!;
  if (isNetworkError(error)) return network;
  if (spanish && looksSpanish(raw)) return raw;
  const code = errorStatus(error);
  const useStatus = status && (options.fallback === undefined || code === 401 || code === 403 || code === 429);
  return (useStatus ? statusMessage(code) : null) ?? fallback;
}
