// node --test scripts/discord/plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bits, calcularPlan, embedNovedad, novedadesPendientes, rellenar, sincronizarMensajes,
} from './plan.mjs';

const deseado = JSON.parse(readFileSync(new URL('./servidor.json', import.meta.url), 'utf8'));

const servidorCasiVacio = () => ({
  guild: { id: 'g', features: [], verification_level: 0, explicit_content_filter: 0, default_message_notifications: 0, preferred_locale: 'en-US' },
  roles: [
    { id: 'g', name: '@everyone', position: 0, permissions: '0' },
    { id: 'b', name: 'Pokémon Universe BOT', position: 1, permissions: '8', managed: true },
  ],
  channels: [
    { id: 'c1', name: 'Canales de texto', type: 4, position: 0 },
    { id: 'c2', name: 'general', type: 0, parent_id: 'c1', position: 0 },
    { id: 'c3', name: 'feedback', type: 0, parent_id: 'c1', position: 1 },
  ],
});

test('en un servidor casi vacío crea roles, canales y Comunidad en el orden que Discord exige', () => {
  const acciones = calcularPlan(servidorCasiVacio(), deseado);
  const tipos = acciones.map((a) => a.tipo);
  assert.deepEqual(acciones.filter((a) => a.tipo === 'crear-rol').map((a) => a.rol), ['Admin', 'Moderador', 'Avisos de novedades', 'Busco partida']);
  // #general se reutiliza (se mueve), no se crea otro.
  assert.ok(acciones.some((a) => a.tipo === 'editar-canal' && a.nombre === 'general' && a.texto.includes('mover a 💬 COMUNIDAD')));
  assert.ok(!acciones.some((a) => a.tipo === 'crear-canal' && a.nombre === 'general'));
  // Los canales de anuncios y foros van después de activar Comunidad.
  const comunidad = tipos.indexOf('ajustes-servidor');
  const novedades = acciones.findIndex((a) => a.nombre === 'novedades');
  const reglas = acciones.findIndex((a) => a.nombre === 'reglas');
  assert.ok(reglas < comunidad && comunidad < novedades);
  // Lo que sobra solo se avisa.
  assert.ok(acciones.some((a) => a.tipo === 'aviso' && a.texto.includes('#feedback')));
  assert.ok(!tipos.includes('borrar-canal'));
});

test('--borrar-sobrantes borra primero los canales y después las categorías', () => {
  const borrados = calcularPlan(servidorCasiVacio(), deseado, { borrarSobrantes: true }).filter((a) => a.tipo === 'borrar-canal').map((a) => a.id);
  assert.deepEqual(borrados, ['c3', 'c1']);
});

test('un rol que ya está bien no genera acciones', () => {
  const actual = servidorCasiVacio();
  actual.roles.push({ id: 'm', name: 'Moderador', position: 2, color: 0x3b4cca, hoist: true, mentionable: true, permissions: bits(deseado.roles[1].permisos) });
  const acciones = calcularPlan(actual, deseado);
  assert.ok(!acciones.some((a) => a.rol === 'Moderador'));
});

test('rellenar cambia las menciones de canal por ids y falla si el canal no existe', () => {
  const canalId = (n) => ({ reglas: '123' })[n];
  assert.equal(rellenar('Lee <#reglas> en {web}', { canalId, web: 'https://x.es' }), 'Lee <#123> en https://x.es');
  assert.throws(() => rellenar('<#nada>', { canalId, web: '' }), /nada/);
});

test('sincronizarMensajes edita lo distinto y republica si cambia el número de mensajes', () => {
  assert.deepEqual(sincronizarMensajes([{ id: '1', content: 'a' }], ['a']), []);
  assert.deepEqual(sincronizarMensajes([{ id: '1', content: 'a' }], ['b']), [{ tipo: 'editar', id: '1', contenido: 'b' }]);
  assert.deepEqual(sincronizarMensajes([], ['b']), [{ tipo: 'publicar', contenido: 'b' }]);
});

const entrada = (version, date, extra = {}) => ({
  version, date, title: `Título ${version}`, published: true,
  content: [{ type: 'NEW', text: 'Algo nuevo', highlight: true }, { type: 'BUGS', text: 'Un arreglo' }], ...extra,
});

test('novedadesPendientes salta las ya publicadas y las no publicadas, y ordena de antigua a nueva', () => {
  const entradas = [entrada('0.3.0', '2026-03-01T00:00:00Z'), entrada('0.1.0', '2026-01-01T00:00:00Z'), entrada('0.2.0', '2026-02-01T00:00:00Z'), entrada('0.4.0', '2026-04-01T00:00:00Z', { published: false })];
  const mensajes = [{ embeds: [{ footer: { text: 'Versión 0.2.0' } }] }];
  assert.deepEqual(novedadesPendientes(entradas, mensajes).map((e) => e.version), ['0.1.0', '0.3.0']);
});

test('embedNovedad agrupa como la página de Novedades y enlaza a la versión', () => {
  const embed = embedNovedad(entrada('1.0.0', '2026-05-01T00:00:00Z', { summary: 'Resumen' }), { web: 'https://x.es', colorHex: '#FFCB05' });
  assert.equal(embed.url, 'https://x.es/changelog#version-1.0.0');
  assert.equal(embed.footer.text, 'Versión 1.0.0');
  assert.equal(embed.description, '*Resumen*\n\n**⭐ Lo destacado**\n• Algo nuevo\n\n**Correcciones**\n• Un arreglo');
});
