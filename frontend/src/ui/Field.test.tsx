import { Search } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field, TextArea } from './Field';
import { Slider } from './Slider';
import { Toggle } from './Toggle';

const noop = () => undefined;

describe('Field', () => {
  it('con icono y grande: el icono es decorativo y el input sigue con su etiqueta', () => {
    const html = renderToStaticMarkup(createElement(Field, { label: 'Buscar Pokémon', hideLabel: true, icon: Search, large: true, hint: 'Enter elige' }));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Buscar Pokémon<\/label>.*<input[^>]*id="\1"/);
    expect(html).toContain('aria-describedby=');
  });
  it('con error marca aria-invalid y apunta al id del error', () => {
    const html = renderToStaticMarkup(createElement(Field, { label: 'Nombre', error: 'Obligatorio' }));
    expect(html).toContain('aria-invalid="true"');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Obligatorio');
  });
  it('sin error no marca invalidez', () => {
    expect(renderToStaticMarkup(createElement(Field, { label: 'Nombre' }))).not.toContain('aria-invalid');
  });
  it('code agranda el texto del campo (código de sala) y lo marca para el teclado', () => {
    const input = /<input[^>]*>/.exec(renderToStaticMarkup(createElement(Field, { label: 'Código', code: true })))?.[0] ?? '';
    expect(input).toMatch(/class="[^"]*code/);
    expect(input).toContain('autoCapitalize="characters"');
    expect(input).toContain('spellCheck="false"');
    const plain = /<input[^>]*>/.exec(renderToStaticMarkup(createElement(Field, { label: 'Nombre' })))?.[0] ?? '';
    expect(plain).not.toMatch(/class="[^"]*code/);
  });
  it('hideLabel deja la etiqueta solo para lectores', () => {
    const label = /<label[^>]*class="([^"]*)"/.exec(renderToStaticMarkup(createElement(Field, { label: 'Buscar', hideLabel: true })))?.[1] ?? '';
    expect(label).toMatch(/srOnly/);
    const shown = /<label[^>]*class="([^"]*)"/.exec(renderToStaticMarkup(createElement(Field, { label: 'Buscar' })))?.[1] ?? '';
    expect(shown).not.toMatch(/srOnly/);
  });
});

describe('TextArea', () => {
  it('muestra el contador n / máx', () => {
    const html = renderToStaticMarkup(createElement(TextArea, { label: 'Notas', value: 'hola', onChange: noop, maxLength: 20 }));
    expect(html).toContain('4 / 20');
  });
});

describe('Slider y Toggle', () => {
  it('el deslizador expone el valor visible y su texto', () => {
    const html = renderToStaticMarkup(createElement(Slider, { label: 'Volumen', value: 40, onChange: noop, min: 0, max: 100, step: 5, valueText: (v) => `${v} %` }));
    expect(html).toContain('type="range"');
    expect(html).toContain('40 %');
    expect(html).toContain('aria-valuetext="40 %"');
    expect(html).toContain('--ratio:0.4');
  });
  it('el interruptor es un switch', () => {
    const html = renderToStaticMarkup(createElement(Toggle, { label: 'Sonido', checked: true, onChange: noop }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });
});
