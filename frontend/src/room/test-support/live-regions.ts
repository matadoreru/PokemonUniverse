import { expect } from 'vitest';

/** Etiquetas de apertura del HTML de `renderToStaticMarkup` (React escapa `>` dentro de los atributos). */
const OPENING_TAG = /<[a-zA-Z][^>]*>/g;
const LIVE_ROLE = /\srole="(status|alert|log)"/;
const ARIA_LIVE = /\saria-live="([^"]*)"/;

/**
 * Regiones vivas del HTML: elementos con `role="status|alert|log"` o con `aria-live` distinto de `off`. Cuenta
 * elementos, no atributos: un `<p role="status" aria-live="polite">` es una sola región. Un `aria-live="off"`
 * explícito apaga también la del rol.
 */
export function liveRegions(html: string): string[] {
  return (html.match(OPENING_TAG) ?? []).filter((tag) => {
    const live = ARIA_LIVE.exec(tag)?.[1];
    if (live === 'off') return false;
    return live !== undefined || LIVE_ROLE.test(tag);
  });
}

/** Regla de AGENTS.md: cada pantalla de juego tiene exactamente una región viva. Si falla, dice cuáles sobran. */
export function expectSingleLiveRegion(html: string, message?: string): void {
  const regions = liveRegions(html);
  expect(regions, `${message ? `${message}: ` : ''}${regions.join(' ')}`).toHaveLength(1);
}
