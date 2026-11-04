import { describe, expect, it } from 'vitest';
import { adminListStatus, adminStatusLabel, adminStatusOptions, adminStatusTone, formatDuration, initialAdminTab, pageBounds, paginationText, pickSelected } from './admin-format';

describe('initialAdminTab', () => {
  it('abre la sección pedida en ?tab= y «Salas» con cualquier otro valor', () => {
    expect(initialAdminTab('?tab=feedback')).toBe('feedback');
    expect(initialAdminTab('?tab=sync')).toBe('sync');
    expect(initialAdminTab('?tab=nada')).toBe('rooms');
    expect(initialAdminTab('')).toBe('rooms');
  });
});

describe('estados', () => {
  it('traduce estados y roles, y deja tal cual los desconocidos', () => {
    expect(adminStatusLabel('IN_PROGRESS')).toBe('En progreso');
    expect(adminStatusLabel('COMPLETED')).toBe('Disponible');
    expect(adminStatusLabel('ADMIN')).toBe('Administrador');
    expect(adminStatusLabel('RARO')).toBe('RARO');
  });
  it('da un tono a cada familia de estados', () => {
    expect(adminStatusTone('RUNNING')).toBe('info');
    expect(adminStatusTone('COMPLETED')).toBe('ok');
    expect(adminStatusTone('INTERRUPTED')).toBe('warn');
    expect(adminStatusTone('ADMIN')).toBe('bad');
    expect(adminStatusTone('CLOSED')).toBe('neutral');
  });
  it('ofrece los filtros de cada sección', () => {
    expect(adminStatusOptions('users').map((o) => o.value)).toEqual(['', 'USER', 'ADMIN']);
    expect(adminStatusOptions('games').map((o) => o.value)).toEqual(['', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INTERRUPTED']);
    expect(adminStatusOptions('rooms').map((o) => o.value)).toEqual(['', 'ACTIVE', 'CLOSED', 'INTERRUPTED']);
  });
});

describe('paginación', () => {
  it('describe la página y el total, con singular', () => {
    expect(paginationText(2, 5, 87)).toBe('Página 2 de 5 · 87 registros');
    expect(paginationText(1, 1, 1)).toBe('Página 1 de 1 · 1 registro');
    expect(paginationText(1, 0, 0)).toBe('Página 1 de 1 · 0 registros');
  });
  it('sabe si hay página anterior y siguiente', () => {
    expect(pageBounds(1, 1)).toEqual({ prev: false, next: false });
    expect(pageBounds(1, 3)).toEqual({ prev: false, next: true });
    expect(pageBounds(3, 3)).toEqual({ prev: true, next: false });
  });
});

describe('adminListStatus', () => {
  const base = { retry: () => undefined, what: 'las salas', empty: { title: 'Vacío', text: 'Nada' } };
  it('el error manda y lleva «Reintentar»', () => {
    const status = adminListStatus({ ...base, error: 'Sin conexión', loading: true, count: 4 });
    expect(status).toMatchObject({ kind: 'error', title: 'No se pudieron cargar las salas', text: 'Sin conexión', action: { label: 'Reintentar' } });
  });
  it('carga sin datos, vacío al acabar y nada con datos', () => {
    expect(adminListStatus({ ...base, error: '', loading: true, count: 0 })).toMatchObject({ kind: 'loading', title: 'Cargando las salas' });
    expect(adminListStatus({ ...base, error: '', loading: false, count: 0 })).toMatchObject({ kind: 'empty', title: 'Vacío' });
    expect(adminListStatus({ ...base, error: '', loading: true, count: 2 })).toBeNull();
  });
});

describe('pickSelected', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  it('elige el pedido si sigue en la lista; si no, el primero', () => {
    expect(pickSelected(items, 'b')).toEqual({ id: 'b' });
    expect(pickSelected(items, 'z')).toEqual({ id: 'a' });
    expect(pickSelected([], null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('usa ms, s o min según la duración', () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration(1_500)).toBe('1.5 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
  });
});

describe('etiquetas de partidas', () => {
  it('una partida completada no está «Disponible»', () => {
    expect(adminStatusLabel('COMPLETED', 'game')).toBe('Completada');
    expect(adminStatusLabel('ABANDONED', 'game')).toBe('Abandonada');
  });
});
