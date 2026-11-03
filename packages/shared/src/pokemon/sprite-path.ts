/** Ruta del proxy de sprites normales (`GET /api/pokemon/{id}/sprite`), con el id como un único segmento. */
export function pokemonSpritePath(id: string): string {
  return `/api/pokemon/${encodeURIComponent(id)}/sprite`;
}
