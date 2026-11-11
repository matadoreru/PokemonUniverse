/**
 * Ajustes de pantalla (E8): movimiento y tamaño del texto, con su suscripción para React. Se guardan en la clave común
 * de los ajustes (`preferences.ts`); el sonido lo lleva el audio en su propia sección. Al importarse sin `window`
 * (pruebas de marcado) no toca el DOM y vale lo de por defecto.
 */
import { useSyncExternalStore } from 'react';
import type { StorageLike } from '../audio/settings';
import { loadPreferences, migratePreferences, updatePreferences, type MotionPreference, type TextPreference } from './preferences';

export interface DisplayPreferences {
  motion: MotionPreference;
  text: TextPreference;
}

export interface DisplayStore {
  get(): DisplayPreferences;
  update(patch: Partial<DisplayPreferences>): void;
  subscribe(listener: () => void): () => void;
}

export function createDisplayStore(storage: StorageLike | null): DisplayStore {
  migratePreferences(storage);
  const { motion, text } = loadPreferences(storage);
  let current: DisplayPreferences = { motion, text };
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    update(patch) {
      const saved = updatePreferences(storage, { ...current, ...patch });
      if (saved.motion === current.motion && saved.text === current.text) return;
      current = { motion: saved.motion, text: saved.text };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const display: DisplayStore = createDisplayStore(browserStorage());

export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(display.subscribe, display.get, display.get);
}

/** Pone el tamaño del texto en `<html>` (`data-text`; tokens.css cambia la letra raíz). Normal, sin atributo. */
export function applyTextSize(root: HTMLElement, text: TextPreference): void {
  if (text === 'normal') root.removeAttribute('data-text');
  else root.setAttribute('data-text', text);
}
