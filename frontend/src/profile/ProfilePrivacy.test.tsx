import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProfilePrivacy, VISIBILITY_HELP, VISIBILITY_LABEL } from './ProfilePrivacy';

describe('ProfilePrivacy', () => {
  it('dice a quién es visible el perfil y abre el ajuste con «Privacidad»', () => {
    const markup = renderToStaticMarkup(createElement(ProfilePrivacy, { value: 'FRIENDS', onSaved: () => undefined }));
    expect(markup).toContain('Perfil visible para: <span');
    expect(markup).toContain('Solo amigos');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('Privacidad');
  });

  it('tres opciones con su texto de ayuda', () => {
    expect(Object.values(VISIBILITY_LABEL)).toEqual(['Todos', 'Solo amigos', 'Nadie']);
    expect(VISIBILITY_HELP.NOBODY).toContain('tampoco tus amigos');
  });
});
