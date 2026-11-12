import { defaultOneOfUsIsFakeConfig, defaultTypeChainConfig, defaultWhoIsWhoPokemonConfig } from '@pokemon-universe/shared/public';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WhoIsWhoPokemonConfigPanel } from '../who-is-who-pokemon/ConfigPanel';
import { PaceField } from './PaceField';
import { CUSTOM_PACE_HINT } from './pace-presets';

const render = (config: unknown, disabled = false) => renderToStaticMarkup(createElement(PaceField, { gameId: 'who-is-who-pokemon', config, disabled, onChange: () => undefined }));
const checkedLabel = (html: string) => /aria-checked="true"[^>]*>([^<]*)</.exec(html)?.[1] ?? null;

describe('PaceField', () => {
  it('con el defaultConfig marca Clásico, con la etiqueta «Ritmo» y su ayuda', () => {
    const html = render(defaultWhoIsWhoPokemonConfig);
    expect(html).toContain('>Ritmo</span>');
    expect(checkedLabel(html)).toBe('Clásico');
    expect(html).toContain('Los valores por defecto del juego.');
  });

  it('un ajuste cubierto tocado a mano deja «Personalizado» sin ninguna marcada', () => {
    const html = render({ ...defaultWhoIsWhoPokemonConfig, rounds: 5 });
    expect(html).not.toContain('aria-checked="true"');
    expect(html).toContain(CUSTOM_PACE_HINT);
    // Sigue en el orden de tabulación: la primera opción recibe el foco.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it('elegir un ritmo envía la configuración entera con sus valores de una vez', () => {
    const onChange = vi.fn();
    const config = { ...defaultOneOfUsIsFakeConfig, fakeKnows: true };
    // Sin DOM en los tests: se llama al `onChange` del `Segmented` que devuelve el componente (no tiene hooks).
    const segmented = PaceField({ gameId: 'one-of-us-is-fake', config, disabled: false, onChange }) as ReactElement<{ onChange(value: string): void }>;
    segmented.props.onChange('FAST');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...config, rounds: 3, selectionSeconds: 20, discussionSeconds: 90 });
  });

  it('deshabilitado, sus opciones también', () => {
    expect(render(defaultWhoIsWhoPokemonConfig, true).match(/disabled=""/g)).toHaveLength(3);
  });

  it('un juego sin ritmos no pinta nada', () => {
    expect(renderToStaticMarkup(createElement(PaceField, { gameId: 'type-chain', config: defaultTypeChainConfig, disabled: false, onChange: () => undefined }))).toBe('');
  });

  it('va arriba del panel, antes de las generaciones', () => {
    const html = renderToStaticMarkup(createElement(WhoIsWhoPokemonConfigPanel, { config: defaultWhoIsWhoPokemonConfig, disabled: false, onChange: async () => undefined }));
    expect(html.indexOf('>Ritmo<')).toBeGreaterThan(-1);
    expect(html.indexOf('>Ritmo<')).toBeLessThan(html.indexOf('Generaciones del tablero'));
  });
});
