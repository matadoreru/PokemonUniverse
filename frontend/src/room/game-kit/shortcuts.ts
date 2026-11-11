/**
 * Atajos de teclado de los juegos: un solo criterio para todas las pantallas.
 *
 * - Se ignoran mientras se escribe en un campo editable (`typingTarget`): `input` de texto, `textarea`, `select` y
 *   contenido editable. Con el foco en un botón, un enlace, una casilla o un deslizador, los números y las letras sí son
 *   atajo.
 * - Intro y Espacio nunca son atajo con el foco en un control (`controlTarget`): siguen activando ese control.
 * - Con el foco dentro de un diálogo abierto (p. ej. «Cómo se juega») no hay atajos del juego.
 * - Las teclas con Ctrl, Alt o Meta, las mantenidas (`repeat`) y las que otro ya atendió (`defaultPrevented`) no son
 *   atajo.
 * - Con el foco dentro de un diálogo abierto (ajustes, ayuda de atajos, confirmaciones) los atajos de la pantalla de
 *   debajo no actúan: pulsar «1» ahí no responde la ronda.
 */

/** Tipos de `input` en los que no se escribe: con el foco en ellos los atajos siguen vivos. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const CONTROL_TAGS: ReadonlySet<string> = new Set(['BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA']);
const CONTROL_ROLES: ReadonlySet<string> = new Set(['button', 'checkbox', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'switch', 'tab']);
/** Teclas que activan el control con foco. */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

/** Lo que se lee del destino de un evento de teclado (el elemento con foco). */
interface ShortcutElement {
  tagName?: unknown;
  type?: unknown;
  isContentEditable?: unknown;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

function shortcutElement(target: unknown): ShortcutElement | null {
  return target !== null && typeof target === 'object' ? target as ShortcutElement : null;
}

function tagOf(element: ShortcutElement): string {
  return typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
}

function attributeOf(element: ShortcutElement, name: string): string | null {
  return typeof element.getAttribute === 'function' ? element.getAttribute(name) : null;
}

/**
 * ¿Se está escribiendo en un campo? `input` (salvo los tipos sin texto: casilla, radio, deslizador, botones, color,
 * fichero), `textarea`, `select` o contenido editable (`contenteditable` con cualquier valor salvo `false`, también el
 * vacío, o heredado: `isContentEditable`).
 */
export function typingTarget(target: unknown): boolean {
  const element = shortcutElement(target);
  if (!element) return false;
  const tag = tagOf(element);
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has(typeof element.type === 'string' ? element.type.toLowerCase() : 'text');
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (element.isContentEditable === true) return true;
  const editable = attributeOf(element, 'contenteditable');
  return editable !== null && editable.toLowerCase() !== 'false';
}

/**
 * ¿El foco está en un control que Intro o Espacio activan? Botones, enlaces con `href`, campos, `summary`, elementos con
 * un rol de control y lo editable. Un título con `tabindex="-1"` (adonde lleva el foco `useFocusOnTransition`) no lo es.
 */
export function controlTarget(target: unknown): boolean {
  const element = shortcutElement(target);
  if (!element) return false;
  if (typingTarget(element)) return true;
  const tag = tagOf(element);
  if (CONTROL_TAGS.has(tag)) return true;
  if (tag === 'A' && attributeOf(element, 'href') !== null) return true;
  const role = attributeOf(element, 'role');
  return role !== null && CONTROL_ROLES.has(role);
}

/** ¿El foco está dentro de un `<dialog>` abierto? */
export function dialogTarget(target: unknown): boolean {
  const element = shortcutElement(target);
  return typeof element?.closest === 'function' && element.closest('dialog[open]') != null;
}

/** Lo que necesita `shortcutKey` del evento de teclado. */
export interface ShortcutEvent {
  key: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
}

/** ¿El foco está dentro de un `<dialog>` abierto? Mientras tanto la pantalla de debajo no recibe atajos. */
export function dialogTarget(target: unknown): boolean {
  const element = shortcutElement(target);
  return typeof element?.closest === 'function' && element.closest('dialog[open]') != null;
}

/** La tecla del evento si cuenta como atajo, o `null` (ver el criterio al principio del módulo). */
export function shortcutKey(event: ShortcutEvent): string | null {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (typingTarget(event.target) || dialogTarget(event.target)) return null;
  if (ACTIVATION_KEYS.has(event.key) && controlTarget(event.target)) return null;
  return event.key;
}

/** Lo que necesita `bindShortcuts` del destino de los eventos (en la app, `window`). */
export interface ShortcutTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
}

/**
 * Escucha los atajos en `target`: `onKey` recibe cada tecla que cuenta como atajo y devuelve si la atendió (entonces se
 * llama a `preventDefault`). Devuelve la función que deja de escuchar (la del efecto de React).
 */
export function bindShortcuts(target: ShortcutTarget, onKey: (key: string) => boolean): () => void {
  const listener = (event: KeyboardEvent) => {
    const key = shortcutKey(event);
    if (key === null || !onKey(key)) return;
    event.preventDefault();
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}
