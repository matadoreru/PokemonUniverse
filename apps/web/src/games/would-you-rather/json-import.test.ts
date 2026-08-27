import { describe, expect, it } from 'vitest';
import { parseWouldYouRatherImportJson, WOULD_YOU_RATHER_JSON_EXAMPLE } from './json-import';

describe('Would You Rather JSON import', () => {
  it('documents and accepts the versioned schema', () => {
    expect(parseWouldYouRatherImportJson(WOULD_YOU_RATHER_JSON_EXAMPLE)).toMatchObject({ version: 1, prompts: [{ optionA: 'Viajar con Lapras' }] });
  });

  it('reports syntax and field paths clearly', () => {
    expect(() => parseWouldYouRatherImportJson('{')).toThrow(/JSON no válido/);
    expect(() => parseWouldYouRatherImportJson('{"version":1,"prompts":[{"optionA":"abc","optionB":"abc"}]}')).toThrow(/prompts\.0/);
  });
});
