import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameArt } from './GameArt';

describe('GameArt', () => {
  it('pinta el sprite del objeto del juego, decorativo', () => {
    const html = renderToStaticMarkup(<GameArt gameId="pokedex-distance" />);
    expect(html).toContain('src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-radar.png"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
  });

  it('sin objeto, el icono de línea del juego', () => {
    const html = renderToStaticMarkup(<GameArt gameId="juego-nuevo" />);
    expect(html).not.toContain('<img');
    expect(html).toContain('lucide-gamepad2');
  });
});
