/** Une clases e ignora los valores falsos. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Estado forzado de un interactivo; solo lo usa la galería (las hojas definen cada pseudo-clase también como clase). */
export type ForcedState = 'hover' | 'focus' | 'active';
