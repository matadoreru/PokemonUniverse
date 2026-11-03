import { describe, expect, it } from 'vitest';
import { authError, authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('traduce las credenciales incorrectas', () => {
    expect(authErrorMessage('Invalid email or password')).toBe('El email o la contraseña no son correctos.');
  });

  it('traduce el correo o el nombre ya ocupados', () => {
    expect(authErrorMessage('Email or username already in use')).toBe('Ese email o ese nombre de usuario ya tienen cuenta.');
  });

  it('traduce el límite de peticiones y el cuerpo demasiado grande', () => {
    expect(authErrorMessage('Too many requests')).toBe('Demasiados intentos seguidos. Espera un minuto y vuelve a probar.');
    expect(authErrorMessage('request entity too large')).toBe('La imagen supera el límite de 5 MB.');
  });

  it('traduce la validación genérica del servidor', () => {
    expect(authErrorMessage('Invalid request body')).toBe('Revisa los datos del formulario.');
    expect(authErrorMessage('Invalid request')).toBe('Revisa los datos del formulario.');
  });

  it('traduce los fallos de red de cada navegador', () => {
    const red = 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
    expect(authErrorMessage('Failed to fetch')).toBe(red);
    expect(authErrorMessage('NetworkError when attempting to fetch resource.')).toBe(red);
    expect(authErrorMessage('Load failed')).toBe(red);
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(red);
  });

  it('deja pasar los mensajes de validación que el servidor ya da en español', () => {
    expect(authErrorMessage('La contraseña debe tener entre 10 y 128 caracteres')).toBe('La contraseña debe tener entre 10 y 128 caracteres');
    expect(authErrorMessage('El nombre contiene caracteres no permitidos')).toBe('El nombre contiene caracteres no permitidos');
    expect(authErrorMessage('El archivo no es una imagen JPEG, PNG o WEBP válida.')).toBe('El archivo no es una imagen JPEG, PNG o WEBP válida.');
  });

  it('da un mensaje genérico en español a lo desconocido', () => {
    const generico = 'No se pudo continuar. Inténtalo de nuevo en unos segundos.';
    expect(authErrorMessage('Internal Server Error')).toBe(generico);
    expect(authErrorMessage('Bad Gateway')).toBe(generico);
    expect(authErrorMessage('Request failed')).toBe(generico);
    expect(authErrorMessage('')).toBe(generico);
    expect(authErrorMessage(undefined)).toBe(generico);
    expect(authErrorMessage({ nada: true })).toBe(generico);
  });
});

describe('authError', () => {
  it('asigna la validación al campo concreto', () => {
    expect(authError('El nombre de usuario debe tener entre 3 y 24 caracteres')).toEqual({ field: 'username', message: 'El nombre de usuario debe tener entre 3 y 24 caracteres' });
    expect(authError('El email no es válido')).toEqual({ field: 'email', message: 'El email no es válido' });
    expect(authError('La contraseña es obligatoria')).toEqual({ field: 'password', message: 'La contraseña es obligatoria' });
    expect(authError('El nombre debe tener entre 2 y 24 caracteres')).toEqual({ field: 'displayName', message: 'El nombre debe tener entre 2 y 24 caracteres' });
  });

  it('deja sin campo los errores generales', () => {
    expect(authError('Invalid email or password')).toEqual({ field: null, message: 'El email o la contraseña no son correctos.' });
    expect(authError(new Error('El avatar no es válido'))).toEqual({ field: null, message: 'El avatar no es válido' });
  });
});
