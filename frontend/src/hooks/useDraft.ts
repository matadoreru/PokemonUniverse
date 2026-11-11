/**
 * Borradores de texto (Q7): lo que se está escribiendo (el chat, una pista, una respuesta) sobrevive a una recarga en
 * `sessionStorage`. Cada borrador tiene un ámbito (sala + partida + campo) y una ronda: solo se recupera en la misma
 * ronda, así que lo de una ronda anterior nunca reaparece; se borra al enviar (`clear`) y al cambiar de ronda. Toda
 * lectura y escritura va en try/catch: sin almacenamiento, el campo funciona igual y solo se pierde al recargar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageLike } from '../audio/settings';

export const DRAFT_PREFIX = 'pokemon-universe-draft:';

/** Dónde vive un borrador: `scope` es el campo (sala, partida y nombre del campo) y `round`, la ronda o turno. */
export interface DraftKey {
  scope: string;
  round: string;
}

/** Clave de borrador con partes que pueden faltar (sin sala o sin partida todavía): entonces no hay borrador. */
export function draftKey(scope: readonly (string | number | null | undefined)[], round: string | number | null | undefined): DraftKey | null {
  if (round === null || round === undefined || scope.some((part) => part === null || part === undefined || part === '')) return null;
  return { scope: scope.join(':'), round: String(round) };
}

function remove(storage: StorageLike | null, scope: string): void {
  try {
    storage?.removeItem(DRAFT_PREFIX + scope);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** El borrador guardado de `key`, recortado a `maxLength`. Uno de otra ronda se borra y no se recupera. */
export function loadDraft(storage: StorageLike | null, key: DraftKey, maxLength = Infinity): string {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(DRAFT_PREFIX + key.scope) ?? null;
  } catch {
    return '';
  }
  if (raw === null) return '';
  try {
    const saved = JSON.parse(raw) as { round?: unknown; text?: unknown };
    if (saved.round === key.round && typeof saved.text === 'string') return saved.text.slice(0, maxLength);
  } catch {
    // Ilegible: como si fuera de otra ronda.
  }
  remove(storage, key.scope);
  return '';
}

/** Guarda el borrador; el texto vacío lo borra. */
export function saveDraft(storage: StorageLike | null, key: DraftKey, text: string): void {
  if (text === '') {
    remove(storage, key.scope);
    return;
  }
  try {
    storage?.setItem(DRAFT_PREFIX + key.scope, JSON.stringify({ round: key.round, text }));
  } catch {
    // Lleno o bloqueado: el borrador dura lo que la pantalla.
  }
}

export function clearDraft(storage: StorageLike | null, key: DraftKey): void {
  remove(storage, key.scope);
}

function sessionStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const idOf = (key: DraftKey | null) => (key ? `${key.scope}\u0000${key.round}` : null);

/**
 * Texto de un campo guardado como borrador: `[texto, cambiar, borrar]`. `cambiar` acepta un valor o una función del
 * actual (como `useState`). Con `key` a `null` es un estado normal, sin guardar. Al cambiar de ronda (o de campo) el
 * texto vuelve a lo guardado para la nueva clave (vacío, salvo tras recargar) y el borrador anterior se borra.
 */
export function useDraft(key: DraftKey | null, { maxLength }: { maxLength?: number } = {}): [string, (next: string | ((current: string) => string)) => void, () => void] {
  const id = idOf(key);
  const read = () => (key ? loadDraft(sessionStore(), key, maxLength) : '');
  const [state, setState] = useState(() => ({ id, text: read() }));
  let current = state;
  if (state.id !== id) {
    // Otra ronda u otro campo: lo escrito antes ya no vale (patrón de estado derivado de React).
    current = { id, text: read() };
    setState(current);
  }
  const keyRef = useRef(key);
  keyRef.current = key;

  // El borrador de otro campo anterior se borra; en el mismo ámbito ya lo hizo `loadDraft` al no coincidir la ronda.
  const previous = useRef(key);
  useEffect(() => {
    const before = previous.current;
    previous.current = keyRef.current;
    if (before && before.scope !== keyRef.current?.scope) clearDraft(sessionStore(), before);
  }, [id]);

  const set = useCallback((next: string | ((value: string) => string)) => {
    setState((s) => {
      const text = typeof next === 'function' ? next(s.text) : next;
      const k = keyRef.current;
      if (k && idOf(k) === s.id) saveDraft(sessionStore(), k, text);
      return { ...s, text };
    });
  }, []);
  const clear = useCallback(() => {
    const k = keyRef.current;
    if (k) clearDraft(sessionStore(), k);
    setState((s) => ({ ...s, text: '' }));
  }, []);
  return [current.text, set, clear];
}
