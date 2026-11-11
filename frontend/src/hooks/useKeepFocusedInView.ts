import { useEffect } from 'react';

/** Variable de `<html>` con el alto visible mientras el teclado virtual no encoge la vista (iOS). */
export const KEYBOARD_VIEWPORT_VAR = '--keyboard-viewport';
/** Lo que tiene que encoger la vista visible para que sea el teclado y no la barra del navegador, en px. */
export const KEYBOARD_MIN_INSET = 120;

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url']);

/** ¿Es un campo que abre el teclado al escribir? (`input` de texto, `textarea` o contenido editable). */
export function isTextEntry(element: Element | null): element is HTMLElement {
  if (!element) return false;
  const field = element as Partial<HTMLInputElement>;
  if (field.disabled === true || field.readOnly === true) return false;
  if (element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(field.type ?? 'text');
  return (element as Partial<HTMLElement>).isContentEditable === true;
}

/**
 * Alto que debe ocupar la app con el teclado abierto, o `null` si no hace falta tocarlo. Con
 * `interactive-widget=resizes-content` (Chrome en Android) el teclado encoge la vista entera y `100dvh` ya cabe. En iOS
 * solo encoge la vista visible: si se escribe en un campo y la vista visible es `KEYBOARD_MIN_INSET` más baja que la
 * de la página sin zoom (el zoom con dos dedos también la encoge), la app se ajusta a ese alto.
 */
export function keyboardViewportHeight({ layoutHeight, visualHeight, scale, editing }: { layoutHeight: number; visualHeight: number; scale: number; editing: boolean }): number | null {
  if (!editing || Math.abs(scale - 1) > 0.01) return null;
  return layoutHeight - visualHeight >= KEYBOARD_MIN_INSET ? Math.round(visualHeight) : null;
}

/**
 * Que el teclado virtual no tape el campo en el que se escribe. Se monta una vez en el armazón (`Layout`): cuando la
 * vista visible encoge con un campo de texto enfocado (el teclado se abre o crece), el campo se desplaza lo justo
 * dentro del `main` para quedar a la vista (`block: 'nearest'`), sea el buscador de Pokémon, una respuesta escrita o
 * el chat. En escritorio la vista no encoge al enfocar, así que no hace nada.
 */
export function useKeepFocusedInView(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let lastHeight = viewport.height;
    let frame = 0;
    const sync = () => {
      const focused = document.activeElement;
      const editing = isTextEntry(focused);
      const height = keyboardViewportHeight({ layoutHeight: window.innerHeight, visualHeight: viewport.height, scale: viewport.scale, editing });
      if (height === null) root.style.removeProperty(KEYBOARD_VIEWPORT_VAR);
      else {
        root.style.setProperty(KEYBOARD_VIEWPORT_VAR, `${height}px`);
        // iOS desplaza la página para enseñar el campo; con la app ya a la altura visible, se vuelve arriba.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      }
      const shrank = viewport.height < lastHeight - 1;
      lastHeight = viewport.height;
      if (shrank && editing) {
        cancelAnimationFrame(frame);
        // Tras el reflujo del nuevo alto: el `main` ya mide lo que queda sobre el teclado.
        frame = requestAnimationFrame(() => focused.scrollIntoView({ block: 'nearest' }));
      }
    };
    // Al salir del campo (el teclado se cierra), la app vuelve a `100dvh`.
    const onFocusOut = () => requestAnimationFrame(sync);
    viewport.addEventListener('resize', sync);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', sync);
      document.removeEventListener('focusout', onFocusOut);
      root.style.removeProperty(KEYBOARD_VIEWPORT_VAR);
    };
  }, []);
}
