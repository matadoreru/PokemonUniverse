/*
 * Los sprites de PokéAPI (96×96) traen mucho margen transparente: el Pokémon visible ocupa la mitad del hueco. Aquí se
 * mide el rectángulo opaco para recortar la vista de la imagen (`object-view-box`) y que `object-fit: contain` escale
 * solo al Pokémon, sin cortarlo.
 */

/** Rectángulo opaco de una imagen RGBA, en píxeles de la imagen (`left`/`top` incluidos, `right`/`bottom` excluidos). */
export interface OpaqueBounds { left: number; top: number; right: number; bottom: number }

/** Alfa por encima del cual un píxel cuenta como parte del Pokémon (descarta el ruido casi invisible del borde). */
const ALPHA_MIN = 16;

/** Rectángulo de los píxeles opacos, o `null` si la imagen es transparente por completo. */
export function opaqueBounds(data: ArrayLike<number>, width: number, height: number): OpaqueBounds | null {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < ALPHA_MIN) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

/** Valor de `object-view-box` para ese rectángulo, o `null` si no recorta nada que merezca la pena (menos de 4 %). */
export function viewBoxFor(bounds: OpaqueBounds, width: number, height: number): string | null {
  const t = bounds.top; const r = width - bounds.right; const b = height - bounds.bottom; const l = bounds.left;
  if (Math.max(t, r, b, l) < Math.min(width, height) * 0.04) return null;
  return `inset(${t}px ${r}px ${b}px ${l}px)`;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * Mide el sprite aparte (`fetch` con CORS, que PokéAPI y el proxy de Java permiten): leer los píxeles del `<img>` mismo
 * falla en un lienzo «contaminado» cuando el sprite viene de otro origen. La respuesta sale de la caché HTTP.
 */
function measure(src: string): Promise<string | null> {
  let box = cache.get(src);
  if (!box) {
    box = fetch(src, { mode: 'cors' })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(bitmap, 0, 0);
        const bounds = opaqueBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        return bounds ? viewBoxFor(bounds, canvas.width, canvas.height) : null;
      })
      .catch(() => null);
    cache.set(src, box);
  }
  return box;
}

/**
 * Recorta la vista de un `<img>` al Pokémon visible. Sin `object-view-box` en el navegador o si la medida falla, no
 * hace nada y el sprite se ve entero como antes.
 */
export function trimSprite(img: HTMLImageElement): void {
  if (typeof CSS === 'undefined' || !CSS.supports('object-view-box', 'inset(1px)')) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  void measure(src).then((box) => {
    if ((img.currentSrc || img.src) !== src) return;
    if (box) img.style.setProperty('object-view-box', box); else img.style.removeProperty('object-view-box');
  });
}
