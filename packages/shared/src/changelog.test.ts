import { describe, expect, it } from 'vitest';
import { changelogChangeSchema, createChangelogSchema, updateChangelogSchema } from './changelog.js';

const base = { version: '0.9.0', title: 'Gran cambio', date: '2026-11-03T12:00:00.000Z', content: [{ type: 'NEW', text: 'Algo nuevo' }] };

describe('esquema de novedades', () => {
  it('acepta y recorta el resumen, y lo deja fuera si no viene', () => {
    expect(createChangelogSchema.parse({ ...base, summary: '  Portada nueva  ' }).summary).toBe('Portada nueva');
    expect(createChangelogSchema.parse(base)).not.toHaveProperty('summary');
    expect(updateChangelogSchema.parse({ summary: '' })).toMatchObject({ summary: '' });
  });

  it('rechaza un resumen de más de 200 caracteres', () => {
    expect(createChangelogSchema.safeParse({ ...base, summary: 'x'.repeat(201) }).success).toBe(false);
    expect(createChangelogSchema.safeParse({ ...base, summary: 'x'.repeat(200) }).success).toBe(true);
  });

  it('admite como mucho tres cambios destacados', () => {
    const change = (highlight: boolean) => ({ type: 'NEW', text: 'Cambio destacado', highlight });
    expect(createChangelogSchema.safeParse({ ...base, content: [change(true), change(true), change(true), change(false)] }).success).toBe(true);
    const four = createChangelogSchema.safeParse({ ...base, content: [change(true), change(true), change(true), change(true)] });
    expect(four.success).toBe(false);
    expect(four.error?.issues).toEqual([expect.objectContaining({ code: 'custom', path: ['content'], message: 'Marca como destacados 3 cambios como máximo.' })]);
  });

  it('exige que highlight sea booleano', () => {
    expect(changelogChangeSchema.safeParse({ type: 'NEW', text: 'Algo nuevo', highlight: 'sí' }).success).toBe(false);
    expect(changelogChangeSchema.parse({ type: 'NEW', text: 'Algo nuevo', highlight: true })).toEqual({ type: 'NEW', text: 'Algo nuevo', highlight: true });
  });
});
