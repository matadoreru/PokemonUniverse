import { apiErrorMessage, errorText, NETWORK_MESSAGE } from '../lib/api-errors';

/**
 * Errores de acceso en español. `api()` lanza un `ApiError` con el mensaje del backend (AuthService, los manejadores de
 * errores de Micronaut y el limitador) o el del navegador cuando falla la red; lo común está en `lib/api-errors.ts`.
 */

export type AuthField = 'username' | 'email' | 'identifier' | 'password' | 'passwordRepeat' | 'displayName';

export interface AuthError {
  /** Campo al que pertenece el error, o `null` si es del formulario entero. */
  field: AuthField | null;
  message: string;
}

const INVALID = 'Revisa los datos del formulario.';
const INVALID_LINK = 'Este enlace no es válido o ha caducado.';
const GENERIC = 'No se pudo continuar. Inténtalo de nuevo en unos segundos.';

/** Mensajes en inglés del backend. */
const TRANSLATED: Record<string, string> = {
  'Invalid email or password': 'El usuario, el email o la contraseña no son correctos.',
  'Email or username already in use': 'Ese email o ese nombre de usuario ya tienen cuenta.',
  'Too many requests': 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  'request entity too large': 'La imagen supera el límite de 5 MB.',
  'Invalid or expired reset link': INVALID_LINK,
  'Invalid request body': INVALID,
  'Invalid request': INVALID,
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
  'El enlace no es válido': null,
  'El avatar no es válido': null,
  'La imagen supera el límite de 5 MB.': null,
  'El archivo no es una imagen JPEG, PNG o WEBP válida.': null,
  'La imagen debe medir entre 64 y 4096 píxeles por lado.': null,
  'Usa una imagen JPEG, PNG o WEBP.': null,
};

/** Error de acceso traducido y, si es de validación, el campo que lo provoca. */
export function authError(error: unknown): AuthError {
  const raw = errorText(error);
  if (Object.hasOwn(SPANISH, raw)) return { field: SPANISH[raw] ?? null, message: raw };
  // Solo pasa el español de la lista, porque lleva su campo; lo demás, traducido o el genérico.
  return { field: null, message: apiErrorMessage(error, { translations: TRANSLATED, network: NETWORK_MESSAGE, spanish: false, status: false, fallback: GENERIC }) };
}

/** Texto en español para un error de acceso (mensaje del servidor, del navegador o un `Error`). */
export function authErrorMessage(error: unknown): string {
  return authError(error).message;
}

/** Mensaje del enlace de recuperación caducado, usado o malformado (el backend lo da en inglés o como validación). */
export const INVALID_LINK_MESSAGE = INVALID_LINK;

/** `true` si el error es el del enlace de recuperación (la pantalla enseña entonces el estado de enlace no válido). */
export function isInvalidResetLink(error: unknown): boolean {
  const raw = errorText(error);
  return raw === 'Invalid or expired reset link' || raw === 'El enlace no es válido';
}

/** Comprueba que las dos contraseñas escritas coinciden. */
export function passwordsMatch(password: string, repeat: string): AuthError | null {
  return password === repeat ? null : { field: 'passwordRepeat', message: 'Las contraseñas no coinciden.' };
}
