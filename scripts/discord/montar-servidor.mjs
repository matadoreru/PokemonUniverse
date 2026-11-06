#!/usr/bin/env node
// Monta el servidor de Discord según scripts/discord/servidor.json.
//
//   node scripts/discord/montar-servidor.mjs --plan       enseña qué cambiaría, sin tocar nada
//   node scripts/discord/montar-servidor.mjs --aplicar    lo aplica (repetirlo es seguro)
//   ... --aplicar --borrar-sobrantes                      además borra los canales que no están en servidor.json
//
// Lee DISCORD_BOT_TOKEN, DISCORD_GUILD_ID y PU_PUBLIC_ORIGIN (URL pública de la web, sin barra final) del entorno o del
// .env de la raíz. `--web <url>` sustituye a PU_PUBLIC_ORIGIN.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIPOS, calcularPlan, embedNovedad, novedadesPendientes, overwrites, rellenar, sincronizarMensajes, textoReglas,
} from './plan.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
if (!aplicar && !args.includes('--plan')) {
  console.error('Uso: node scripts/discord/montar-servidor.mjs --plan | --aplicar [--borrar-sobrantes] [--web https://…]');
  process.exit(1);
}

cargarEnv(join(raiz, '.env'));
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const web = (valorArg('--web') ?? process.env.PU_PUBLIC_ORIGIN ?? '').replace(/\/+$/, '');
if (!token || !guildId) salir('Faltan DISCORD_BOT_TOKEN o DISCORD_GUILD_ID en el .env.');
if (!/^https?:\/\//.test(web)) salir('Falta la URL pública de la web: añade PU_PUBLIC_ORIGIN al .env o pasa --web https://…');

const deseado = JSON.parse(readFileSync(join(aqui, 'servidor.json'), 'utf8'));
const g = `/guilds/${guildId}`;

// ── API de Discord ───────────────────────────────────────────────────────────
async function api(metodo, ruta, cuerpo) {
  for (let intento = 0; intento < 5; intento += 1) {
    const respuesta = await fetch(`https://discord.com/api/v10${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': encodeURIComponent('montar-servidor.mjs'),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (respuesta.status === 429) {
      const { retry_after: espera = 1 } = await respuesta.json();
      await new Promise((r) => setTimeout(r, Math.ceil(espera * 1000) + 100));
      continue;
    }
    if (respuesta.status === 204) return null;
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const error = new Error(`${metodo} ${ruta} → ${respuesta.status}: ${JSON.stringify(datos)}`);
      error.status = respuesta.status;
      throw error;
    }
    return datos;
  }
  throw new Error(`${metodo} ${ruta}: demasiados reintentos por límite de peticiones`);
}

async function leerEstado() {
  const [guild, roles, channels] = await Promise.all([api('GET', g), api('GET', `${g}/roles`), api('GET', `${g}/channels`)]);
  return { guild, roles, channels };
}

// ── Estructura: roles, canales y ajustes ─────────────────────────────────────
const actual = await leerEstado();
const bot = await api('GET', '/users/@me');
console.log(`Servidor «${actual.guild.name}»${aplicar ? '' : ' (solo plan, no se cambia nada)'}\n`);

const acciones = calcularPlan(actual, deseado, { borrarSobrantes: args.includes('--borrar-sobrantes') });
console.log(acciones.length === 0 ? 'Estructura: ya está como servidor.json.' : 'Estructura:');
for (const accion of acciones) console.log(`  ${accion.tipo === 'aviso' ? '·' : '→'} ${accion.texto}`);

const roles = new Map(actual.roles.map((r) => [r.name, r.id]));
roles.set('@everyone', guildId);
const canales = new Map();
for (const c of actual.channels) if (!canales.has(c.name.toLowerCase())) canales.set(c.name.toLowerCase(), c);
const rolId = (nombre) => roles.get(nombre) ?? salir(`El rol ${nombre} no existe.`);
const canal = (nombre) => canales.get(nombre.toLowerCase());

if (aplicar) {
  for (const accion of acciones) await ejecutar(accion);
}

async function ejecutar(accion) {
  switch (accion.tipo) {
    case 'crear-rol': {
      const creado = await api('POST', `${g}/roles`, accion.datos);
      roles.set(creado.name, creado.id);
      break;
    }
    case 'editar-rol':
      await api('PATCH', `${g}/roles/${rolId(accion.rol)}`, accion.cambios);
      break;
    case 'ordenar-roles': {
      const vivos = await api('GET', `${g}/roles`);
      const huecos = vivos.filter((r) => accion.roles.includes(r.name)).map((r) => r.position).sort((a, b) => b - a);
      await api('PATCH', `${g}/roles`, accion.roles.map((nombre, i) => ({ id: rolId(nombre), position: huecos[i] })));
      break;
    }
    case 'crear-canal': {
      const creado = await api('POST', `${g}/channels`, datosCanal(accion));
      canales.set(creado.name.toLowerCase(), creado);
      break;
    }
    case 'editar-canal': {
      const editado = await api('PATCH', `/channels/${accion.id}`, datosCanal(accion, true));
      canales.set(editado.name.toLowerCase(), editado);
      break;
    }
    case 'ajustes-servidor': {
      const a = deseado.ajustes;
      const features = [...new Set([...actual.guild.features, 'COMMUNITY'])];
      await api('PATCH', g, {
        verification_level: a.verificacion,
        explicit_content_filter: a.filtroContenido,
        default_message_notifications: a.notificaciones,
        preferred_locale: a.idioma,
        features,
        rules_channel_id: canal(a.canalReglas).id,
        public_updates_channel_id: canal(a.canalAvisosDiscord).id,
      });
      break;
    }
    case 'ordenar-canales': {
      const posiciones = deseado.categorias.flatMap((categoria, i) => {
        const padre = canal(categoria.nombre).id;
        return [{ id: padre, position: i }, ...categoria.canales.map((c, j) => ({ id: canal(c.nombre).id, position: j }))];
      });
      await api('PATCH', `${g}/channels`, posiciones);
      break;
    }
    case 'borrar-canal':
      await api('DELETE', `/channels/${accion.id}`);
      break;
    default:
      break;
  }
}

function datosCanal(accion, editar = false) {
  const datos = { name: accion.nombre, permission_overwrites: overwrites(accion.permisos, rolId) };
  if (!editar) datos.type = accion.tipoId;
  if (accion.tipoId === TIPOS.categoria) return datos;
  datos.parent_id = canal(accion.categoria).id;
  if (accion.tipoId !== TIPOS.voz) {
    datos.topic = accion.tema ?? null;
    datos.rate_limit_per_user = accion.lento;
  }
  if (accion.etiquetas) {
    // Conserva el id de las etiquetas que ya existen para no quitarlas de las publicaciones.
    const previas = editar ? (canal(accion.nombre)?.available_tags ?? []) : [];
    datos.available_tags = accion.etiquetas.map((e) => {
      const previa = previas.find((p) => p.name === e.nombre);
      return { ...(previa ? { id: previa.id } : {}), name: e.nombre, moderated: Boolean(e.soloModeradores) };
    });
  }
  return datos;
}

// ── Contenido: mensajes fijos, pantalla de reglas, Onboarding y Novedades ────
const contexto = { canalId: (nombre) => canal(nombre)?.id ?? (aplicar ? undefined : `(${nombre})`), web };
const mensajesFijos = {
  ...Object.fromEntries(Object.entries(deseado.mensajes).map(([nombre, textos]) => [nombre, textos.map((t) => rellenar(t, contexto))])),
  reglas: [rellenar(textoReglas(deseado), contexto)],
};

console.log('\nContenido:');
for (const [nombre, textos] of Object.entries(mensajesFijos)) {
  const destino = canal(nombre);
  const previos = destino ? await mensajesDelBot(destino.id) : [];
  const pasos = sincronizarMensajes(previos, textos);
  if (pasos.length === 0) { console.log(`  · #${nombre}: ya está al día`); continue; }
  console.log(`  → #${nombre}: ${pasos.map((p) => p.tipo).join(', ')} mensaje${pasos.length === 1 ? '' : 's'}`);
  if (!aplicar) continue;
  for (const paso of pasos) {
    if (paso.tipo === 'borrar') await api('DELETE', `/channels/${destino.id}/messages/${paso.id}`);
    if (paso.tipo === 'editar') await api('PATCH', `/channels/${destino.id}/messages/${paso.id}`, { content: paso.contenido, allowed_mentions: { parse: [] } });
    if (paso.tipo === 'publicar') await api('POST', `/channels/${destino.id}/messages`, { content: paso.contenido, allowed_mentions: { parse: [] } });
  }
}

await pantallaDeReglas();
await onboarding();
await novedades();
console.log(aplicar ? '\nHecho.' : '\nNada cambiado. Ejecuta con --aplicar para hacerlo.');

async function mensajesDelBot(canalId) {
  const mensajes = await api('GET', `/channels/${canalId}/messages?limit=100`);
  return mensajes.filter((m) => m.author.id === bot.id).reverse();
}

/** Reglas que hay que aceptar antes de escribir. La API no es pública: si Discord la rechaza, se explica cómo hacerlo a mano. */
async function pantallaDeReglas() {
  const values = deseado.reglas.map((r) => r.replace(/<#([a-z0-9-]+)>/g, '#$1').slice(0, 300));
  const actualVerificacion = await api('GET', `${g}/member-verification`).catch(() => null);
  const igual = actualVerificacion?.form_fields?.[0] && JSON.stringify(actualVerificacion.form_fields[0].values) === JSON.stringify(values);
  if (igual) { console.log('  · Pantalla de reglas: ya está al día'); return; }
  console.log('  → Pantalla de reglas: activarla con las reglas de servidor.json');
  if (!aplicar) return;
  try {
    await api('PATCH', `${g}/member-verification`, {
      enabled: true,
      description: 'Pokémon Universe: minijuegos de Pokémon para jugar con amigos.',
      form_fields: [{ field_type: 'TERMS', label: 'Lee y acepta las reglas del servidor', required: true, values }],
    });
  } catch (error) {
    console.log(`    ! Discord no la dejó activar por API (${error.status}). Hazlo a mano: Ajustes del servidor → Acceso → Reglas.`);
  }
}

async function onboarding() {
  const o = deseado.onboarding;
  const previo = await api('GET', `${g}/onboarding`).catch(() => null);
  const ids = o.canalesPorDefecto.map((n) => canal(n)?.id);
  const pregunta = previo?.prompts?.find((p) => p.title === o.pregunta);
  const opcionesIguales = pregunta && JSON.stringify(pregunta.options.map((op) => [op.title, op.role_ids])) === JSON.stringify(o.opciones.map((op) => [op.titulo, [roles.get(op.rol)]]));
  const canalesIguales = previo && ids.every(Boolean) && JSON.stringify([...previo.default_channel_ids].sort()) === JSON.stringify([...ids].sort());
  if (previo?.enabled && opcionesIguales && canalesIguales) { console.log('  · Onboarding: ya está al día'); return; }
  console.log(`  → Onboarding: «${o.pregunta}» con ${o.opciones.map((op) => op.rol).join(' y ')}, y ${ids.length} canales por defecto`);
  if (!aplicar) return;
  let semilla = (BigInt(Date.now() - 1420070400000) << 22n);
  const nuevoId = () => String((semilla += 1n));
  try {
    await api('PUT', `${g}/onboarding`, {
      enabled: true,
      mode: 0,
      default_channel_ids: ids,
      prompts: [{
        id: pregunta?.id ?? nuevoId(),
        type: 0,
        title: o.pregunta,
        single_select: false,
        required: false,
        in_onboarding: true,
        options: o.opciones.map((op) => ({
          id: pregunta?.options.find((p) => p.title === op.titulo)?.id ?? nuevoId(),
          title: op.titulo,
          description: op.descripcion,
          emoji_name: op.emoji,
          role_ids: [rolId(op.rol)],
          channel_ids: [],
        })),
      }],
    });
  } catch (error) {
    console.log(`    ! No se pudo configurar el Onboarding: ${error.message}`);
  }
}

async function novedades() {
  const respuesta = await fetch(`${web}/api/changelog`).catch((error) => ({ ok: false, statusText: error.message }));
  if (!respuesta.ok) { console.log(`  ! Novedades: no se pudo leer ${web}/api/changelog (${respuesta.status ?? respuesta.statusText})`); return; }
  const { entries } = await respuesta.json();
  const destino = canal(deseado.novedades.canal);
  const previos = destino ? await mensajesDelBot(destino.id) : [];
  const pendientes = novedadesPendientes(entries, previos);
  if (pendientes.length === 0) { console.log('  · #novedades: ya está al día'); return; }
  console.log(`  → #novedades: publicar ${pendientes.map((e) => `v${e.version}`).join(', ')}`);
  if (!aplicar) return;
  for (const entrada of pendientes) {
    await api('POST', `/channels/${destino.id}/messages`, {
      embeds: [embedNovedad(entrada, { web, colorHex: deseado.novedades.color })],
      allowed_mentions: { parse: [] },
    });
  }
}

// ── Utilidades ───────────────────────────────────────────────────────────────
function cargarEnv(ruta) {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function valorArg(nombre) {
  const i = args.indexOf(nombre);
  return i === -1 ? undefined : args[i + 1];
}

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

