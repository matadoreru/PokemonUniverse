/**
 * Ayuda de atajos (Q6): la lista sale de la propia pantalla, de los controles visibles con `aria-keyshortcuts`
 * (cartas, opciones, «Confirmar»…). Así ningún juego tiene que registrar sus atajos aparte y la lista nunca se queda
 * vieja: si un control no está, su atajo tampoco.
 */

/** Una fila de la ayuda: las teclas (alternativas, como «A» o «1») y lo que hacen. */
export interface ShortcutEntry {
  keys: string[];
  label: string;
}

/** Tecla que abre la ayuda. */
export const HELP_KEY = '?';

const KEY_NAMES: Readonly<Record<string, string>> = {
  Enter: 'Intro',
  ' ': 'Espacio',
  Space: 'Espacio',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: 'Retroceso',
};

/** Nombre de una tecla de `aria-keyshortcuts` como se escribe en la ayuda («Enter» → «Intro»). */
export function keyLabel(key: string): string {
  return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** Lo que se lee de un control con atajo (en las pruebas, un objeto simulado). */
export interface ShortcutSource {
  getAttribute(name: string): string | null;
  /** El texto visible, sin las teclas (`<kbd>`) ni lo decorativo (`aria-hidden`). */
  textContent: string | null;
  /** `false` si el control no se ve (oculto, en otra pestaña o en un panel cerrado). */
  visible: boolean;
}

/**
 * Filas de la ayuda a partir de los controles: uno por fila, con su nombre accesible (o su texto) y sus teclas, sin los
 * ocultos; dos controles iguales (mismas teclas y nombre) cuentan una vez. Los deshabilitados sí salen: «Confirmar» con
 * Intro está apagado hasta elegir, pero es un atajo de la pantalla.
 */
export function shortcutEntries(sources: Iterable<ShortcutSource>): ShortcutEntry[] {
  const seen = new Set<string>();
  const out: ShortcutEntry[] = [];
  for (const source of sources) {
    if (!source.visible) continue;
    const keys = (source.getAttribute('aria-keyshortcuts') ?? '').split(/\s+/).filter(Boolean);
    const label = (source.getAttribute('aria-label') ?? source.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (keys.length === 0 || !label) continue;
    const id = `${keys.join(' ')}|${label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ keys, label });
  }
  return out;
}

function textWithoutKeys(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('kbd, [aria-hidden="true"]').forEach((extra) => extra.remove());
  return copy.textContent ?? '';
}

/** Los controles con atajo de `root` (en la app, el `main`), fuera de los diálogos abiertos. */
export function screenShortcuts(root: ParentNode): ShortcutEntry[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[aria-keyshortcuts]')).filter((el) => !el.closest('dialog'));
  return shortcutEntries(elements.map((el) => ({
    getAttribute: (name: string) => el.getAttribute(name),
    textContent: textWithoutKeys(el),
    visible: el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'),
  })));
}
