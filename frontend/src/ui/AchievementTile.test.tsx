import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AchievementTile } from './AchievementTile';
import type { AchievementTileProps } from './AchievementTile';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => motion.reduced }));

const render = (props: Partial<AchievementTileProps> = {}) =>
  renderToStaticMarkup(createElement(AchievementTile, { name: 'Primera victoria', description: 'Gana una partida', state: 'unlocked', art: 'X', ...props }));

describe('AchievementTile', () => {
  it('rendersNameDescriptionAndDate', () => {
    const html = render({ date: '7 nov 2026' });
    expect(html).toMatch(/^<li/);
    expect(html).toMatch(/<h3[^>]*>Primera victoria<\/h3>/);
    expect(html).toContain('Gana una partida');
    expect(html).toContain('7 nov 2026');
    expect(html).not.toContain('aria-label');
  });

  it('lockedHasLockAndLabel', () => {
    const html = render({ state: 'locked' });
    expect(html).toContain('aria-label="Bloqueado: Primera victoria"');
    expect(html).toContain('lucide-lock');
  });

  it('secretShowsGivenPlaceholderText', () => {
    const html = render({ state: 'secret', name: '???', description: 'Logro secreto' });
    expect(html).toContain('aria-label="Bloqueado: ???"');
    expect(html).toContain('lucide-lock');
    expect(html).toContain('Logro secreto');
    expect(html).not.toContain('Primera victoria');
  });

  it('freshAddsAnimationClassOnlyWithoutReducedMotion', () => {
    motion.reduced = false;
    expect(render({ fresh: true })).toMatch(/class="[^"]*fresh/);
    expect(render()).not.toMatch(/class="[^"]*fresh/);
    motion.reduced = true;
    expect(render({ fresh: true })).not.toMatch(/class="[^"]*fresh/);
    motion.reduced = false;
  });
});
