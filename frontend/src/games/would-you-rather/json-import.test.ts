import { describe, expect, it } from 'vitest';
import { importIssuePlace, parseWouldYouRatherImportJson, WOULD_YOU_RATHER_JSON_EXAMPLE } from './json-import';

/** El mensaje del error que lanza el import (para mirar el texto entero). */
function failure(source: string): string {
  try {
    parseWouldYouRatherImportJson(source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('El import debía fallar');
}

describe('Would You Rather JSON import', () => {
  it('documents and accepts the versioned schema', () => {
    expect(parseWouldYouRatherImportJson(WOULD_YOU_RATHER_JSON_EXAMPLE)).toMatchObject({ version: 1, prompts: [{ optionA: 'Viajar con Lapras' }] });
  });

  it('reports syntax and field paths clearly', () => {
    expect(() => parseWouldYouRatherImportJson('{')).toThrow(/JSON no válido/);
    expect(() => parseWouldYouRatherImportJson('{"version":1,"prompts":[{"optionA":"abc","optionB":"abc"}]}')).toThrow(/prompts\.0/);
  });

  it('todos los errores salen en castellano, con el dilema y la opción', () => {
    const syntax = failure('{"version": 1,\n "prompts": [}');
    expect(syntax).toMatch(/^JSON no válido: revisa las comas, las comillas y las llaves/);
    expect(syntax).not.toMatch(/Unexpected|token|position|JSON at/i);
    expect(failure('{"version":1,"prompts":[{"optionA":"abc","optionB":"Volar con Dragonite"}]}')).toContain('prompts.0.optionA (dilema 1, opción A): Escribe al menos 4 caracteres.');
    expect(failure('{"version":1,"prompts":[{"optionA":"Lapras","optionB":"lapras"}]}')).toContain('Las dos opciones deben ser diferentes.');
    expect(failure('{"version":2,"prompts":[{"optionA":"Viajar con Lapras","optionB":"Volar con Dragonite"}]}')).toContain('version: Debe valer 1.');
    expect(failure('{"version":1,"prompts":[{"optionA":5,"optionB":"Volar con Dragonite"}]}')).toContain('(dilema 1, opción A): Debe ser un texto.');
    expect(failure('{"version":1,"prompts":[],"extra":true}')).toMatch(/Incluye al menos un dilema\..*Campo no admitido: extra\.|Campo no admitido: extra\..*Incluye al menos un dilema\./);
    expect(failure('[]')).toContain('raíz: Debe ser un objeto.');
    for (const message of [failure('{"version":"1"}'), failure('{"version":1,"prompts":{}}')]) expect(message).not.toMatch(/Invalid|expected|received/);
  });

  it('nombra el sitio del fallo', () => {
    expect(importIssuePlace([])).toBe('raíz');
    expect(importIssuePlace(['prompts', 2, 'optionB'])).toBe('prompts.2.optionB (dilema 3, opción B)');
    expect(importIssuePlace(['version'])).toBe('version');
  });
});
