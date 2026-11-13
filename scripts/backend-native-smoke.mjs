#!/usr/bin/env node
// Humo funcional del backend (pensado para el binario nativo, vale igual para la JVM): recorre la API, las subidas de
// avatar en los tres formatos y salas por /ws en las que se arranca cada minijuego. Sirve para dos cosas:
//   1. comprobar una imagen nativa recién compilada (backend/Dockerfile.native);
//   2. ejercitar la JVM bajo el agente de trazas de GraalVM al regenerar los metadatos de
//      backend/src/main/resources/META-INF/native-image/ (receta en docs/migracion-java-pendientes.md).
// Uso: node scripts/backend-native-smoke.mjs [http://127.0.0.1:18080]
// El backend debe arrancar con ROOMS_ENABLED=true y COOKIE_SECURE=false, y recién arrancado: en `prod` los límites de
// peticiones no se desactivan (30 de /api/auth y 12 subidas de avatar cada 15 min por IP) y una pasada los roza.
// Crea cuentas `nativa_*` (correo @nativa.example.test) e invitados «Nativa …»; bórralos después de la BD.
// Sale con 1 si alguna comprobación falla.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] ?? 'http://127.0.0.1:18080').replace(/\/$/, '');
const avatars = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'src', 'test', 'resources', 'avatars');
const failures = [];
const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function report(ok, label, detail) {
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

function short(text, max = 140) {
  const flat = String(text).replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Cliente con su propia cookie de sesión. */
class Client {
  cookie = '';

  async call(method, path, { json, body, type, expect } = {}) {
    const headers = { Origin: base };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload = body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
    if (type) headers['Content-Type'] = type;
    let response;
    try {
      response = await fetch(`${base}${path}`, { method, headers, body: payload, redirect: 'manual' });
    } catch (error) {
      report(false, `${method} ${path}`, String(error.cause ?? error));
      return { status: 0, text: '', data: null, bytes: Buffer.alloc(0) };
    }
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      if (pair.startsWith('pu_session=')) this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? '';
    const text = /json|text|yaml/.test(contentType) ? bytes.toString('utf8') : `<${contentType} ${bytes.length} bytes>`;
    let data = null;
    if (contentType.includes('json')) { try { data = JSON.parse(text); } catch { /* se informa abajo */ } }
    const expected = expect === undefined ? [200] : [].concat(expect);
    report(expected.includes(response.status), `${method} ${path} → ${response.status}`, short(text));
    return { status: response.status, text, data, bytes };
  }
}

/** Conexión a /ws: sobres {id, event, payload}, respuestas por id y avisos por evento. */
class Room {
  static async open(client, name) {
    const room = new Room(name);
    const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`, { headers: { Cookie: client.cookie, Origin: base } });
    room.socket = socket;
    socket.onmessage = (message) => room.frame(JSON.parse(String(message.data)));
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = (event) => reject(new Error(`no se abre /ws: ${event.message ?? event.type}`));
      socket.onclose = (event) => reject(new Error(`/ws cerrado ${event.code}`));
    });
    socket.onclose = () => {};
    return room;
  }

  constructor(name) { this.name = name; this.nextId = 0; this.pending = new Map(); this.state = null; this.events = new Map(); }

  frame(frame) {
    if (frame.id !== undefined && this.pending.has(frame.id)) {
      this.pending.get(frame.id)(frame);
      this.pending.delete(frame.id);
      return;
    }
    if (!frame.event) return;
    this.events.set(frame.event, (this.events.get(frame.event) ?? 0) + 1);
    if (frame.event === 'room:state' || frame.event === 'session:restored') this.state = frame.payload;
  }

  request(event, payload = {}) {
    const id = String(++this.nextId);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: 'sin respuesta en 15 s' }); }, 15_000);
      this.pending.set(id, (frame) => { clearTimeout(timer); resolve(frame); });
      this.socket.send(JSON.stringify({ id, event, payload }));
    });
  }

  /** Comando que debe aceptarse. */
  async must(event, payload = {}) {
    const ack = await this.request(event, payload);
    report(ack.ok === true, `ws ${this.name} ${event}`, ack.ok ? short(JSON.stringify(ack.data ?? {}), 100) : ack.error);
    return ack;
  }

  close() { this.socket.close(1000); }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const anon = new Client();
  const health = await anon.call('GET', '/api/health');
  report(health.data?.status === 'ok' && health.data?.database === 'ready', 'salud: status ok y base de datos lista', `esquema ${health.data?.schemaVersion}`);
  await anon.call('GET', '/health');
  await anon.call('GET', '/health/readiness');
  await anon.call('GET', '/health/liveness');
  await anon.call('GET', '/prometheus');

  // Catálogo por JPA.
  const games = await anon.call('GET', '/api/games');
  const gameList = Array.isArray(games.data) ? games.data : games.data?.games ?? [];
  report(gameList.length > 0, 'listado de juegos con contenido', `${gameList.length} juegos`);
  const selector = await anon.call('GET', '/api/pokemon/selector');
  report((selector.data?.pokemon?.length ?? 0) > 0, 'selector de Pokémon con contenido', `${selector.data?.pokemon?.length} Pokémon`);
  await anon.call('GET', '/api/pokemon/selector?generations=1,2&includeForms=true');
  await anon.call('GET', '/api/pokemon/pikachu/sprite', { expect: [200, 404, 502, 503] });
  await anon.call('GET', '/api/changelog');
  await anon.call('GET', '/api/tcg/options');
  await anon.call('POST', '/api/tcg/eligibility', { json: {}, expect: [200, 400] });
  await anon.call('GET', '/api/daily', { expect: [200, 401] });
  await anon.call('GET', '/api/achievements', { expect: [200, 401] });
  await anon.call('GET', '/api/categories', { expect: [200, 401] });
  await anon.call('GET', '/api/would-you-rather-prompts', { expect: [200, 401] });
  await anon.call('GET', '/api/no-existe', { expect: 404 });
  await anon.call('GET', '/api/auth/me', { expect: [200, 401] });
  await anon.call('GET', '/api/admin/summary', { expect: [401, 403] });

  // Registro, login y perfil.
  const ana = new Client();
  const cuentaA = { username: `nativa_a_${suffix}`.slice(0, 24), email: `nativa_a_${suffix}@nativa.example.test`, password: 'contrasena-nativa-segura' };
  const cuentaB = { username: `nativa_b_${suffix}`.slice(0, 24), email: `nativa_b_${suffix}@nativa.example.test`, password: 'contrasena-nativa-segura' };
  await anon.call('POST', '/api/auth/register', { json: { username: 'x', email: 'no-es-correo', password: '1' }, expect: 400 });
  await anon.call('POST', '/api/auth/register', { body: '{mal json', type: 'application/json', expect: 400 });
  const registered = await ana.call('POST', '/api/auth/register', { json: cuentaA, expect: 201 });
  report(Boolean(ana.cookie), 'el registro deja la cookie de sesión', registered.data?.username ?? registered.data?.user?.username);
  await ana.call('POST', '/api/auth/register', { json: cuentaA, expect: [400, 409] });
  await ana.call('POST', '/api/auth/logout', { expect: [200, 204] });
  await ana.call('POST', '/api/auth/login', { json: { identifier: cuentaA.username, password: 'equivocada-equivocada' }, expect: [400, 401] });
  await ana.call('POST', '/api/auth/login', { json: { identifier: cuentaA.email, password: cuentaA.password } });
  report(Boolean(ana.cookie), 'el login deja la cookie de sesión');
  await ana.call('GET', '/api/auth/me');
  await ana.call('GET', '/api/auth/profile');
  await ana.call('PATCH', '/api/auth/profile', { json: { profileVisibility: 'FRIENDS' }, expect: [200, 400] });
  await ana.call('GET', '/api/auth/progress');
  await ana.call('GET', '/api/achievements');
  await ana.call('GET', '/api/daily');
  await ana.call('GET', '/api/daily/leaderboard', { expect: [200, 403] });
  await ana.call('GET', `/api/users/${cuentaA.username}/profile`);
  await ana.call('POST', '/api/auth/password/forgot', { json: { identifier: cuentaA.email }, expect: [200, 202, 204] });
  await ana.call('POST', '/api/auth/password/reset', { json: { token: 'a'.repeat(64), password: 'otra-contrasena-nativa' }, expect: [400, 404] });

  // Avatares: un lector por formato (JPEG y WebP de TwelveMonkeys, PNG del JDK) y el codificador WebP por JNI.
  for (const [file, type] of [['p3.png', 'image/png'], ['interlaced.png', 'image/png'], ['mozjpeg.jpg', 'image/jpeg'],
    ['p3-orient6-progressive.jpg', 'image/jpeg'], ['cmyk.jpg', 'image/jpeg'], ['lossless-alpha.webp', 'image/webp'],
    ['lossy-alpha-metadata.webp', 'image/webp']]) {
    const upload = await ana.call('PUT', '/api/auth/profile/avatar/custom', { body: readFileSync(join(avatars, file)), type });
    const url = upload.data?.avatarUrl ?? upload.data?.user?.avatarUrl ?? upload.data?.avatar?.url;
    const name = typeof url === 'string' ? url : JSON.stringify(upload.data ?? {}).match(/[\w-]+\.webp/)?.[0];
    if (!name) { report(false, `avatar ${file}: la respuesta no trae el fichero`, short(upload.text)); continue; }
    const stored = await ana.call('GET', name.startsWith('/') ? name : `/api/auth/avatars/${name}`);
    const riff = stored.bytes.subarray(0, 4).toString('latin1') === 'RIFF' && stored.bytes.subarray(8, 12).toString('latin1') === 'WEBP';
    report(riff, `avatar ${file}: se guarda como WebP`, `${stored.bytes.length} bytes`);
  }
  await ana.call('PUT', '/api/auth/profile/avatar/custom', { body: Buffer.from('no soy una imagen'), type: 'image/png', expect: 400 });
  await ana.call('PUT', '/api/auth/profile/avatar/custom', { body: Buffer.from('GIF89a'), type: 'image/gif', expect: [400, 415] });
  await ana.call('DELETE', '/api/auth/profile/avatar');
  const invitado = new Client();
  await invitado.call('POST', '/api/auth/guest', { json: { displayName: `Nativa ${suffix}`.slice(0, 24) }, expect: 201 });
  const invitadoAvatar = new Client();
  await invitadoAvatar.call('POST', `/api/auth/guest/custom-avatar?displayName=${encodeURIComponent(`Nativa av ${suffix}`.slice(0, 24))}`,
    { body: readFileSync(join(avatars, 'palette-alpha.png')), type: 'image/png', expect: 201 });

  // Contenido propio, opiniones y amigos.
  const bea = new Client();
  await bea.call('POST', '/api/auth/register', { json: cuentaB, expect: 201 });
  const categoria = await ana.call('POST', '/api/categories', { json: { text: `Pokémon de prueba ñandú ${suffix}` }, expect: [200, 201] });
  await ana.call('GET', '/api/categories');
  const categoriaId = categoria.data?.id ?? categoria.data?.category?.id;
  if (categoriaId) {
    await ana.call('PATCH', `/api/categories/${categoriaId}`, { json: { enabled: false }, expect: [200, 405] });
    await ana.call('DELETE', `/api/categories/${categoriaId}`, { expect: [200, 204] });
  }
  const dilema = await ana.call('POST', '/api/would-you-rather-prompts', { json: { optionA: `Opción A ${suffix}`, optionB: `Opción B ${suffix}` }, expect: [200, 201] });
  await ana.call('GET', '/api/would-you-rather-prompts');
  const dilemaId = dilema.data?.id ?? dilema.data?.prompt?.id;
  if (dilemaId) await ana.call('DELETE', `/api/would-you-rather-prompts/${dilemaId}`, { expect: [200, 204] });
  await ana.call('POST', '/api/feedback', { json: { type: 'BUG', description: `Prueba de humo de la imagen nativa ${suffix}` }, expect: [200, 201, 400] });
  const solicitud = await ana.call('POST', '/api/friends/requests', { json: { username: cuentaB.username }, expect: [200, 201] });
  const friendsB = await bea.call('GET', '/api/friends');
  const solicitudId = friendsB.data?.incoming?.[0]?.id ?? solicitud.data?.request?.id;
  if (solicitudId) await bea.call('POST', `/api/friends/requests/${solicitudId}/accept`);
  const friendsA = await ana.call('GET', '/api/friends');
  report((friendsA.data?.friends?.length ?? 0) === 1, 'las dos cuentas quedan como amigas');
  await ana.call('GET', `/api/users/${cuentaB.username}/profile`);

  // Sala por /ws: crear, unirse, chat y arrancar cada minijuego.
  if (typeof WebSocket !== 'function') { report(false, 'este Node no trae WebSocket global'); return; }
  let host;
  let guest;
  try {
    host = await Room.open(ana, 'anfitrión');
    guest = await Room.open(bea, 'invitado');
  } catch (error) {
    report(false, 'abrir /ws', String(error));
    return;
  }
  report(true, 'las dos conexiones a /ws se abren');
  await host.must('session:attach');
  const created = await host.must('room:create');
  const code = created.data?.room?.code;
  report(typeof code === 'string' && code.length === 6, 'la sala creada trae su código', code);
  await guest.must('session:attach');
  await guest.must('room:join', { code });
  await host.must('room:chat:send', { text: 'Hola desde la imagen nativa: ¿Pikachu o Ñoño?' });
  await host.request('room:invite', { userId: registered.data?.id ?? registered.data?.user?.id ?? 'x' });
  await host.request('room:evento-desconocido');
  await pause(300);
  report((guest.events.get('room:state') ?? 0) > 0, 'el invitado recibe room:state');
  report((guest.events.get('room:chat:message') ?? 0) > 0, 'el invitado recibe el mensaje del chat');

  // Una sala por minijuego (durante una partida no se puede volver al lobby): elegir, confirmar, arrancar y salir.
  // Tres jugadores (Impostor los exige) y una pausa por sala: /ws admite 50 eventos cada 10 s por conexión.
  const third = await Room.open(invitado, 'tercero');
  await third.must('session:attach');
  await guest.must('room:leave');
  await host.must('room:leave');
  let started = 0;
  const notStarted = [];
  for (const game of gameList) {
    const id = game.id ?? game.gameId;
    const room = await host.request('room:create');
    await guest.request('room:join', { code: room.data?.room?.code });
    const select = await host.request('room:select-game', { gameId: id });
    await third.request('room:join', { code: room.data?.room?.code });
    await guest.request('room:set-ready', { ready: true });
    await third.request('room:set-ready', { ready: true });
    const start = select.ok ? await host.request('room:start-game') : select;
    await pause(200);
    const instance = JSON.stringify(host.state ?? {}).match(/"gameInstanceId":"([^"]+)"/)?.[1];
    if (start.ok && instance) {
      started += 1;
      await guest.request('game:skip-vote:set', { gameInstanceId: instance, wantsToSkip: true });
      await host.request('game:action', { gameInstanceId: instance, actionEpoch: 'x', action: { type: 'humo' } });
    } else {
      notStarted.push(`${id}: ${start.ok ? 'sin partida en room:state' : start.error}`);
    }
    await guest.request('room:leave');
    await third.request('room:leave');
    await host.request('room:leave');
    await pause(1200);
  }
  third.close();
  // Sobre una BD recién creada TCGdex aún no ha terminado de sincronizar (tarda hasta 30 min): que Higher or Lower:
  // Cartas no arranque por falta de cartas es un aviso, no un fallo del binario.
  const withoutData = notStarted.filter((line) => /No hay al menos dos cartas TCG/.test(line));
  const failed = notStarted.filter((line) => !withoutData.includes(line));
  report(failed.length === 0, `minijuegos arrancados por /ws: ${started}/${gameList.length}`, short(failed.join(' | '), 900));
  if (withoutData.length) console.log(`AVISO sin datos para arrancar: ${withoutData.join(' | ')}`);

  const daily = await host.request('daily:start');
  console.log(`INFO daily:start → ${daily.ok ? 'ok' : daily.error}`);
  await pause(300);
  await host.request('room:leave');
  host.close();
  guest.close();
  await ana.call('DELETE', `/api/friends/${registered.data?.id ?? registered.data?.user?.id ?? 'x'}`, { expect: [200, 204, 400, 404] });
  await ana.call('GET', '/prometheus');
}

await main();
console.log(failures.length ? `\n${failures.length} comprobaciones fallidas:\n- ${failures.join('\n- ')}` : '\nTodo en orden.');
process.exit(failures.length ? 1 : 0);
