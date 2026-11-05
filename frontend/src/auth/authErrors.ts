/**
 * Errores de acceso en español. `api()` lanza `Error(body.error)`, así que la entrada es el mensaje del backend
 * (AuthService, los manejadores de errores de Micronaut y el limitador) o el del navegador cuando falla la red.
 */

export type AuthField = 'username' | 'email' | 'identifier' | 'password' | 'displayName';

export interface AuthError {
  /** Campo al que pertenece el error, o `null` si es del formulario entero. */
  field: AuthField | null;
  message: string;
}

const NETWORK = 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
const INVALID = 'Revisa los datos del formulario.';
const GENERIC = 'No se pudo continuar. Inténtalo de nuevo en unos segundos.';

/** Mensajes en inglés del backend y del navegador. */
const TRANSLATED: Record<string, string> = {
  'Invalid email or password': 'El usuario, el email o la contraseña no son correctos.',
  'Email or username already in use': 'Ese email o ese nombre de usuario ya tienen cuenta.',
  'Too many requests': 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  'request entity too large': 'La imagen supera el límite de 5 MB.',
  'Invalid request body': INVALID,
  'Invalid request': INVALID,
  // Fallos de red: Chromium, Firefox y Safari.
  'Failed to fetch': NETWORK,
  'NetworkError when attempting to fetch resource.': NETWORK,
  'Load failed': NETWORK,
};

/**
 * Mensajes que el backend ya da en español (RegisterRequest, LoginRequest, GuestRequest, AvatarService y
 * AvatarController), con el campo al que pertenecen. Solo estos pasan tal cual.
 */
const SPANISH: Record<string, AuthField | null> = {
  'El nombre de usuario es obligatorio': 'username',
  'El nombre de usuario debe tener entre 3 y 24 caracteres': 'username',
  'El nombre de usuario solo admite letras, números y guion bajo': 'username',
  'El email es obligatorio': 'email',
  'El email no puede superar los 254 caracteres': 'email',
  'El email no es válido': 'email',
  'Escribe tu email o tu nombre de usuario': 'identifier',
  'El email o el usuario no puede superar los 254 caracteres': 'identifier',
  'La contraseña es obligatoria': 'password',
  'La contraseña debe tener entre 10 y 128 caracteres': 'password',
  'La contraseña debe tener entre 1 y 128 caracteres': 'password',
  'El nombre es obligatorio': 'displayName',
  'El nombre debe tener entre 2 y 24 caracteres': 'displayName',
  'El nombre contiene caracteres no permitidos': 'displayName',
  'El avatar no es válido': null,
  'La imagen supera el límite de 5 MB.': null,
  'El archivo no es una imagen JPEG, PNG o WEBP válida.': null,
  'La imagen debe medir entre 64 y 4096 píxeles por lado.': null,
  'Usa una imagen JPEG, PNG o WEBP.': null,
};

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

/** Error de acceso traducido y, si es de validación, el campo que lo provoca. */
export function authError(error: unknown): AuthError {
  const raw = rawMessage(error).trim();
  if (Object.hasOwn(SPANISH, raw)) return { field: SPANISH[raw] ?? null, message: raw };
  return { field: null, message: Object.hasOwn(TRANSLATED, raw) ? TRANSLATED[raw]! : GENERIC };
}

/** Texto en español para un error de acceso (mensaje del servidor, del navegador o un `Error`). */
export function authErrorMessage(error: unknown): string {
  return authError(error).message;
}
