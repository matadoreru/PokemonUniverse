/**
 * Destino tras entrar: la ruta protegida que mandó a `/auth` (`RequireAuth` la deja en el estado de la navegación, con
 * su `?sala=`), o `/play`. Solo rutas internas de la propia web: nada que empiece por `//` ni con esquema, ni `/auth`.
 */
export function authRedirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/play';
  if (from === '/auth' || from.startsWith('/auth?') || from.startsWith('/auth/')) return '/play';
  return from;
}

/** Estado con el que `RequireAuth` manda a `/auth`: la ruta de la que venía, con su búsqueda. */
export function authRedirectState(location: { pathname: string; search: string }): { from: string } {
  return { from: `${location.pathname}${location.search}` };
}
