import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./catalog.js', () => ({ loadGoldenCatalog: () => ({}) }));

const { checkFailureMessages, checkFixtures, writeFixtures } = await import('./runner.js');

const files = new Map([
  ['counter/basic.json', '{\n  "a": 1\n}\n'],
  ['counter/config-cases.json', '[]\n'],
]);

let outDir: string;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'golden-'));
  writeFixtures(outDir, files);
  mkdirSync(join(outDir, 'catalog'));
  writeFileSync(join(outDir, 'catalog', 'gen1-2.json'), '{}\n');
});
afterEach(() => rmSync(outDir, { recursive: true, force: true }));

describe('checkFixtures', () => {
  it('no informa nada si el disco coincide (e ignora catalog/)', () => {
    expect(checkFixtures(outDir, files)).toEqual([]);
  });

  it('informa el fichero cuyo contenido ha derivado', () => {
    writeFileSync(join(outDir, 'counter', 'basic.json'), '{\n  "a": 2\n}\n');
    expect(checkFixtures(outDir, files)).toEqual(['counter/basic.json']);
  });

  it('informa una fixture obsoleta sin escenario', () => {
    writeFileSync(join(outDir, 'counter', 'old.json'), '{}\n');
    mkdirSync(join(outDir, 'gone'));
    writeFileSync(join(outDir, 'gone', 'x.json'), '{}\n');
    expect(checkFixtures(outDir, files).sort()).toEqual(['counter/old.json', 'gone/x.json']);
  });

  it('informa un fichero que falta', () => {
    rmSync(join(outDir, 'counter', 'config-cases.json'));
    expect(checkFixtures(outDir, files)).toEqual(['counter/config-cases.json']);
  });
});

describe('writeFixtures', () => {
  it('elimina las fixtures obsoletas, conserva catalog/ y reescribe el resto', () => {
    writeFileSync(join(outDir, 'counter', 'old.json'), '{}\n');
    writeFileSync(join(outDir, 'counter', 'basic.json'), 'drift');
    expect(writeFixtures(outDir, files)).toEqual({ written: 2, removed: ['counter/old.json'] });
    expect(existsSync(join(outDir, 'counter', 'old.json'))).toBe(false);
    expect(existsSync(join(outDir, 'catalog', 'gen1-2.json'))).toBe(true);
    expect(readFileSync(join(outDir, 'counter', 'basic.json'), 'utf8')).toBe(files.get('counter/basic.json'));
    expect(checkFixtures(outDir, files)).toEqual([]);
  });
});

describe('checkFailureMessages', () => {
  it('lista cada ruta y termina con la instrucción de regenerar', () => {
    expect(checkFailureMessages('golden', ['counter/basic.json'])).toEqual([
      'Fixture dorada desactualizada: golden/counter/basic.json',
      'Ejecuta npm run golden:export',
    ]);
  });

  it('no produce mensajes sin diferencias', () => {
    expect(checkFailureMessages('golden', [])).toEqual([]);
  });
});
