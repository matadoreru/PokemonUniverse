/**
 * Errores al enviar feedback, en español. `api()` lanza `Error(body.error)`: la entrada es el mensaje del backend
 * (CreateFeedbackRequest, FeedbackService, la sesión o el limitador) o el del navegador cuando falla la red.
 */

const NETWORK = 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
const GENERIC = 'No se pudo enviar. Inténtalo de nuevo en unos segundos.';

/** Mensajes en inglés del backend y del navegador. */
const TRANSLATED: Record<string, string> = {
  'Authentication required': 'Tu sesión ha caducado. Vuelve a entrar para enviar el feedback.',
  'Too many requests': 'Has enviado muchos mensajes seguidos. Espera un minuto y vuelve a probar.',
  'Invalid request body': 'Revisa los datos del formulario.',
  'Invalid request': 'Revisa los datos del formulario.',
  'Failed to fetch': NETWORK,
  'NetworkError when attempting to fetch resource.': NETWORK,
  'Load failed': NETWORK,
};

/** Mensajes que el backend ya da en español (CreateFeedbackRequest.java y FeedbackService.java): pasan tal cual. */
export const FEEDBACK_SPANISH_MESSAGES: readonly string[] = [
  'Selecciona un minijuego.',
  'El código de sala no es válido.',
  'Selecciona el tipo de feedback.',
  'Describe el feedback con al menos 10 caracteres.',
  'El feedback no puede superar los 2.000 caracteres.',
  'El minijuego solo se incluye cuando el feedback hace referencia a uno.',
  'El minijuego seleccionado no existe.',
];

/** Texto en español para un fallo al enviar feedback; un mensaje desconocido nunca se enseña tal cual. */
export function feedbackErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  if (FEEDBACK_SPANISH_MESSAGES.includes(raw)) return raw;
  return Object.hasOwn(TRANSLATED, raw) ? TRANSLATED[raw]! : GENERIC;
}
