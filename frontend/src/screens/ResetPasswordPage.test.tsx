import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ResetPasswordPage, removeTokenFromUrl } from './ResetPasswordPage';

const render = (url: string) => renderToStaticMarkup(<StaticRouter location={url}><AuthProvider><ResetPasswordPage /></AuthProvider></StaticRouter>);

describe('ResetPasswordPage', () => {
  it('sin token enseña el enlace no válido y pedir otro', () => {
    const html = render('/auth/nueva-contrasena');
    expect(html).toContain('Este enlace no es válido o ha caducado.');
    expect(html).toContain('href="/auth/recuperar"');
    expect(html).toContain('Pedir otro enlace');
    expect(html).not.toContain('Contraseña nueva');
  });

  it('con token enseña el formulario', () => {
    const html = render('/auth/nueva-contrasena?token=x');
    expect(html).toContain('Contraseña nueva');
    expect(html).toContain('Repite la contraseña');
    expect(html).not.toContain('Pedir otro enlace');
  });

  it('quita el token de la barra de direcciones', () => {
    const replaceState = vi.fn();
    removeTokenFromUrl({ location: { pathname: '/auth/nueva-contrasena', search: '?token=x&a=1', hash: '' }, history: { state: null, replaceState } });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/auth/nueva-contrasena?a=1');
  });
});
