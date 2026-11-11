import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../audio/settings';
import { clearDraft, DRAFT_PREFIX, draftKey, loadDraft, saveDraft, useDraft, type DraftKey } from './useDraft';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

const ronda1: DraftKey = { scope: 'ABCD:partida-1:pista', round: '1' };
const ronda2: DraftKey = { ...ronda1, round: '2' };

describe('borradores', () => {
  it('guarda y restaura el borrador de la misma ronda', () => {
    const storage = memoryStorage();
    saveDraft(storage, ronda1, 'Camina sobre dos patas');
    expect(loadDraft(storage, ronda1)).toBe('Camina sobre dos patas');
    expect(loadDraft(storage, ronda1, 6)).toBe('Camina');
  });

  it('al enviar se borra: el texto vacío o clearDraft quitan la clave', () => {
    const storage = memoryStorage();
    saveDraft(storage, ronda1, 'hola');
    clearDraft(storage, ronda1);
    expect(storage.data.size).toBe(0);
    saveDraft(storage, ronda1, 'hola');
    saveDraft(storage, ronda1, '');
    expect(storage.data.size).toBe(0);
    expect(loadDraft(storage, ronda1)).toBe('');
  });

  it('un borrador de otra ronda no se restaura y se borra', () => {
    const storage = memoryStorage();
    saveDraft(storage, ronda1, 'de la ronda 1');
    expect(loadDraft(storage, ronda2)).toBe('');
    expect(storage.data.size).toBe(0);
    // Ni aunque se vuelva a pedir la ronda 1.
    expect(loadDraft(storage, ronda1)).toBe('');
  });

  it('lo ilegible o un almacenamiento que lanza no rompen nada', () => {
    const storage = memoryStorage({ [DRAFT_PREFIX + ronda1.scope]: '{no es json' });
    expect(loadDraft(storage, ronda1)).toBe('');
    expect(storage.data.size).toBe(0);
    expect(loadDraft(throwing, ronda1)).toBe('');
    expect(() => saveDraft(throwing, ronda1, 'x')).not.toThrow();
    expect(() => clearDraft(throwing, ronda1)).not.toThrow();
    expect(loadDraft(null, ronda1)).toBe('');
  });

  it('draftKey: sin sala, partida o ronda no hay borrador', () => {
    expect(draftKey(['ABCD', 'p1', 'pista'], 3)).toEqual({ scope: 'ABCD:p1:pista', round: '3' });
    expect(draftKey(['ABCD', undefined, 'pista'], 3)).toBeNull();
    expect(draftKey(['ABCD', 'p1', 'pista'], null)).toBeNull();
    expect(draftKey(['', 'p1', 'pista'], 1)).toBeNull();
  });
});

describe('useDraft', () => {
  afterEach(() => vi.unstubAllGlobals());

  function Campo({ draft }: { draft: DraftKey | null }) {
    const [text] = useDraft(draft, { maxLength: 10 });
    return createElement('output', null, text);
  }

  it('al montarse (tras recargar) recupera el borrador de su ronda, recortado al máximo del campo', () => {
    const storage = memoryStorage();
    saveDraft(storage, ronda1, 'Respuesta muy larga');
    vi.stubGlobal('window', { sessionStorage: storage });
    expect(renderToStaticMarkup(createElement(Campo, { draft: ronda1 }))).toBe('<output>Respuesta </output>');
  });

  it('en otra ronda empieza vacío y sin `key` no guarda nada', () => {
    const storage = memoryStorage();
    saveDraft(storage, ronda1, 'vieja');
    vi.stubGlobal('window', { sessionStorage: storage });
    expect(renderToStaticMarkup(createElement(Campo, { draft: ronda2 }))).toBe('<output></output>');
    expect(storage.data.size).toBe(0);
    expect(renderToStaticMarkup(createElement(Campo, { draft: null }))).toBe('<output></output>');
  });

  it('sin window (pruebas de marcado, SSR) es un estado normal', () => {
    expect(renderToStaticMarkup(createElement(Campo, { draft: ronda1 }))).toBe('<output></output>');
  });
});
