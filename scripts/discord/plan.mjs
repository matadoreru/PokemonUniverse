// Lógica pura del montaje del servidor de Discord: compara el estado actual con servidor.json y devuelve las acciones.
// No hace peticiones; montar-servidor.mjs las ejecuta en orden.

export const PERMISOS = {
  CREATE_INSTANT_INVITE: 0n, KICK_MEMBERS: 1n, BAN_MEMBERS: 2n, ADMINISTRATOR: 3n, ADD_REACTIONS: 6n, VIEW_AUDIT_LOG: 7n,
  STREAM: 9n, VIEW_CHANNEL: 10n, SEND_MESSAGES: 11n, MANAGE_MESSAGES: 13n, EMBED_LINKS: 14n, ATTACH_FILES: 15n,
  READ_MESSAGE_HISTORY: 16n, USE_EXTERNAL_EMOJIS: 18n, CONNECT: 20n, SPEAK: 21n, MUTE_MEMBERS: 22n, DEAFEN_MEMBERS: 23n,
  MOVE_MEMBERS: 24n, USE_VAD: 25n, CHANGE_NICKNAME: 26n, MANAGE_NICKNAMES: 27n, USE_APPLICATION_COMMANDS: 31n,
  MANAGE_THREADS: 34n, CREATE_PUBLIC_THREADS: 35n, CREATE_PRIVATE_THREADS: 36n, SEND_MESSAGES_IN_THREADS: 38n,
  MODERATE_MEMBERS: 40n,
};

export const TIPOS = { texto: 0, voz: 2, categoria: 4, anuncios: 5, foro: 15 };
/** Tipos que Discord solo permite con el modo Comunidad activado. */
const TIPOS_COMUNIDAD = new Set([TIPOS.anuncios, TIPOS.foro]);

export function bits(nombres = []) {
  let total = 0n;
  for (const nombre of nombres) {
    if (!(nombre in PERMISOS)) throw new Error(`Permiso desconocido en servidor.json: ${nombre}`);
    total |= 1n << PERMISOS[nombre];
  }
  return total.toString();
}

export const color = (hex) => Number.parseInt(hex.replace('#', ''), 16);
const clave = (nombre) => nombre.toLowerCase();

/** Lista plana de los canales deseados, en orden, con su categoría y sus permisos efectivos (los de la categoría + los propios). */
export function canalesDeseados(deseado) {
  return deseado.categorias.flatMap((categoria) => categoria.canales.map((canal, posicion) => ({
    ...canal,
    tipoId: TIPOS[canal.tipo],
    categoria: categoria.nombre,
    posicion,
    permisos: { ...categoria.permisos, ...canal.permisos },
  })));
}

/** Overwrites de Discord a partir de `{ rol: { permitir, denegar } }`; `rolId` traduce nombres a ids (null si aún no existe). */
export function overwrites(permisos = {}, rolId) {
  return Object.entries(permisos).map(([rol, { permitir = [], denegar = [] }]) => ({
    id: rolId(rol), type: 0, allow: bits(permitir), deny: bits(denegar),
  }));
}

const firmaOverwrites = (lista = []) => JSON.stringify(
  lista.map(({ id, allow, deny }) => [id, String(allow), String(deny)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
);

const firmaEtiquetas = (lista = []) => JSON.stringify(
  lista.map((e) => [e.name ?? e.nombre, Boolean(e.moderated ?? e.soloModeradores)]).sort(),
);

/**
 * Acciones para llevar el servidor de `actual` a `deseado`. `actual` = { guild, roles, channels } tal como los da la API.
 * Cada acción lleva `fase` (orden de ejecución), `tipo` y `texto` (para el plan). Los ids de lo que aún no existe se
 * resuelven al aplicar, por nombre.
 */
export function calcularPlan(actual, deseado, { borrarSobrantes = false } = {}) {
  const acciones = [];
  const rolesPorNombre = new Map(actual.roles.map((r) => [r.name, r]));
  const everyone = actual.roles.find((r) => r.id === actual.guild.id);

  // Roles
  const permisosEveryone = bits(deseado.everyone);
  if (everyone.permissions !== permisosEveryone) {
    acciones.push({ fase: 1, tipo: 'editar-rol', rol: '@everyone', cambios: { permissions: permisosEveryone }, texto: 'Ajustar los permisos de @everyone' });
  }
  // Se crean de arriba abajo: Discord pone cada rol nuevo justo encima de @everyone, así que el primero acaba arriba.
  for (const rol of deseado.roles) {
    const datos = { name: rol.nombre, permissions: bits(rol.permisos), color: color(rol.color), hoist: rol.separado, mentionable: rol.mencionable };
    const existente = rolesPorNombre.get(rol.nombre);
    if (!existente) {
      acciones.push({ fase: 1, tipo: 'crear-rol', rol: rol.nombre, datos, texto: `Crear el rol ${rol.nombre}` });
      continue;
    }
    const cambios = Object.fromEntries(Object.entries(datos).filter(([k, v]) => existente[k] !== v));
    if (Object.keys(cambios).length > 0) {
      acciones.push({ fase: 1, tipo: 'editar-rol', rol: rol.nombre, cambios, texto: `Editar el rol ${rol.nombre} (${Object.keys(cambios).join(', ')})` });
    }
  }
  const nombresRoles = deseado.roles.map((r) => r.nombre);
  const existentesEnOrden = actual.roles.filter((r) => nombresRoles.includes(r.name)).sort((a, b) => b.position - a.position).map((r) => r.name);
  const deseadosExistentes = nombresRoles.filter((n) => existentesEnOrden.includes(n));
  if (JSON.stringify(existentesEnOrden) !== JSON.stringify(deseadosExistentes)) {
    acciones.push({ fase: 1, tipo: 'ordenar-roles', roles: nombresRoles, texto: `Ordenar los roles: ${nombresRoles.join(' > ')}` });
  }

  // Canales: se casan por nombre y tipo.
  const libres = [...actual.channels];
  const tomar = (nombre, tipoId) => {
    const i = libres.findIndex((c) => c.type === tipoId && clave(c.name) === clave(nombre));
    return i === -1 ? undefined : libres.splice(i, 1)[0];
  };
  const categoriasActuales = new Map();
  deseado.categorias.forEach((categoria, posicion) => {
    const existente = tomar(categoria.nombre, TIPOS.categoria);
    if (existente) categoriasActuales.set(categoria.nombre, existente);
    const base = { fase: 2, nombre: categoria.nombre, tipoId: TIPOS.categoria, permisos: categoria.permisos ?? {}, posicion };
    if (!existente) acciones.push({ ...base, tipo: 'crear-canal', texto: `Crear la categoría ${categoria.nombre}` });
    else if (firmaOverwrites(existente.permission_overwrites) !== firmaOverwrites(overwrites(categoria.permisos, (n) => idRol(actual, n)))) {
      acciones.push({ ...base, tipo: 'editar-canal', id: existente.id, texto: `Ajustar los permisos de la categoría ${categoria.nombre}` });
    }
  });

  const comunidad = actual.guild.features.includes('COMMUNITY');
  for (const canal of canalesDeseados(deseado)) {
    const existente = tomar(canal.nombre, canal.tipoId);
    const fase = TIPOS_COMUNIDAD.has(canal.tipoId) && !comunidad ? 4 : 2;
    const base = { fase, nombre: canal.nombre, tipoId: canal.tipoId, categoria: canal.categoria, tema: canal.tema, lento: canal.lento ?? 0, etiquetas: canal.etiquetas, permisos: canal.permisos, posicion: canal.posicion };
    const etiqueta = canal.tipoId === TIPOS.voz ? `🔊 ${canal.nombre}` : `#${canal.nombre}`;
    if (!existente) {
      acciones.push({ ...base, tipo: 'crear-canal', texto: `Crear ${etiqueta} en ${canal.categoria}` });
      continue;
    }
    const diferencias = [];
    const padre = categoriasActuales.get(canal.categoria);
    if (!padre || existente.parent_id !== padre.id) diferencias.push(`mover a ${canal.categoria}`);
    if ((canal.tema ?? null) !== (existente.topic ?? null) && canal.tipoId !== TIPOS.voz) diferencias.push('tema');
    if ((canal.lento ?? 0) !== (existente.rate_limit_per_user ?? 0)) diferencias.push('modo lento');
    if (canal.etiquetas && firmaEtiquetas(canal.etiquetas) !== firmaEtiquetas(existente.available_tags)) diferencias.push('etiquetas');
    if (firmaOverwrites(existente.permission_overwrites) !== firmaOverwrites(overwrites(canal.permisos, (n) => idRol(actual, n)))) diferencias.push('permisos');
    if (diferencias.length > 0) acciones.push({ ...base, fase: 2, tipo: 'editar-canal', id: existente.id, texto: `Editar ${etiqueta}: ${diferencias.join(', ')}` });
  }

  // Ajustes del servidor y modo Comunidad (necesita #reglas y #avisos-discord, creados en la fase 2).
  const a = deseado.ajustes;
  const cambiosServidor = [];
  if (actual.guild.verification_level !== a.verificacion) cambiosServidor.push('verificación');
  if (actual.guild.explicit_content_filter !== a.filtroContenido) cambiosServidor.push('filtro de contenido');
  if (actual.guild.default_message_notifications !== a.notificaciones) cambiosServidor.push('notificaciones');
  if (actual.guild.preferred_locale !== a.idioma) cambiosServidor.push('idioma');
  if (!comunidad) cambiosServidor.push('activar Comunidad');
  const reglas = actual.channels.find((c) => c.id === actual.guild.rules_channel_id);
  const avisos = actual.channels.find((c) => c.id === actual.guild.public_updates_channel_id);
  if (reglas?.name !== a.canalReglas || avisos?.name !== a.canalAvisosDiscord) cambiosServidor.push('canales de reglas y avisos');
  if (cambiosServidor.length > 0) acciones.push({ fase: 3, tipo: 'ajustes-servidor', texto: `Ajustes del servidor: ${cambiosServidor.join(', ')}` });

  // Orden de categorías y canales: una sola llamada al final si algo no está en su sitio.
  const ordenActual = (lista) => [...lista].sort((x, y) => x.position - y.position || x.id.localeCompare(y.id)).map((c) => clave(c.name));
  const categoriasEnOrden = ordenActual(actual.channels.filter((c) => c.type === TIPOS.categoria && deseado.categorias.some((d) => clave(d.nombre) === clave(c.name))));
  let desordenado = acciones.some((x) => x.tipo === 'crear-canal' || (x.tipo === 'editar-canal' && x.texto.includes('mover')))
    || JSON.stringify(categoriasEnOrden) !== JSON.stringify(deseado.categorias.map((c) => clave(c.nombre)));
  for (const categoria of deseado.categorias) {
    const padre = categoriasActuales.get(categoria.nombre);
    if (!padre) continue;
    const hijos = ordenActual(actual.channels.filter((c) => c.parent_id === padre.id && categoria.canales.some((d) => clave(d.nombre) === clave(c.name))));
    if (JSON.stringify(hijos) !== JSON.stringify(categoria.canales.map((c) => clave(c.nombre)))) desordenado = true;
  }
  if (desordenado) acciones.push({ fase: 5, tipo: 'ordenar-canales', texto: 'Ordenar categorías y canales' });

  // Lo que sobra: categorías primero no, canales primero (borrar una categoría deja sus canales sueltos).
  const sobrantes = libres.sort((x, y) => Number(x.type === TIPOS.categoria) - Number(y.type === TIPOS.categoria));
  for (const canal of sobrantes) {
    const etiqueta = canal.type === TIPOS.categoria ? `la categoría ${canal.name}` : canal.type === TIPOS.voz ? `🔊 ${canal.name}` : `#${canal.name}`;
    acciones.push(borrarSobrantes
      ? { fase: 6, tipo: 'borrar-canal', id: canal.id, texto: `Borrar ${etiqueta}` }
      : { fase: 6, tipo: 'aviso', texto: `Sobra ${etiqueta} (se queda; usa --borrar-sobrantes para borrarlo)` });
  }

  return acciones.sort((x, y) => x.fase - y.fase);
}

function idRol(actual, nombre) {
  if (nombre === '@everyone') return actual.guild.id;
  return actual.roles.find((r) => r.name === nombre)?.id ?? null;
}

/** Sustituye `<#nombre>` por la mención real del canal y `{web}` por la URL pública. */
export function rellenar(texto, { canalId, web }) {
  return texto
    .replace(/<#([a-z0-9-]+)>/g, (todo, nombre) => {
      const id = canalId(nombre);
      if (!id) throw new Error(`El texto menciona <#${nombre}>, pero ese canal no existe.`);
      return `<#${id}>`;
    })
    .replace(/\{web\}/g, web);
}

/** Mensaje de #reglas a partir de la lista de reglas y las sanciones. */
export function textoReglas(deseado) {
  const lista = deseado.reglas.map((regla, i) => `**${i + 1}.** ${regla}`).join('\n');
  return `# Reglas\n\n${lista}\n\n**Sanciones:** ${deseado.sanciones}`;
}

/**
 * Qué hacer con los mensajes del bot en un canal para que queden exactamente `deseados` (en orden).
 * `actuales` son los mensajes del bot del más antiguo al más nuevo.
 */
export function sincronizarMensajes(actuales, deseados) {
  if (actuales.length === deseados.length) {
    return deseados.flatMap((contenido, i) => actuales[i].content === contenido ? [] : [{ tipo: 'editar', id: actuales[i].id, contenido }]);
  }
  return [...actuales.map((m) => ({ tipo: 'borrar', id: m.id })), ...deseados.map((contenido) => ({ tipo: 'publicar', contenido }))];
}

const ETIQUETAS_CATEGORIA = { NEW: 'Nuevo', MINIGAMES: 'Minijuegos', BALANCE: 'Balance', INTERFACE: 'Interfaz', IMPROVEMENTS: 'Mejoras', BUGS: 'Correcciones', TECHNICAL: 'Técnico' };
const pieVersion = (version) => `Versión ${version}`;
const recortar = (texto, max) => (texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`);

/** Embed de Discord para una entrada del changelog público, con el mismo agrupado que la página de Novedades. */
export function embedNovedad(entrada, { web, colorHex }) {
  const destacados = entrada.content.filter((c) => c.highlight === true);
  const resto = entrada.content.filter((c) => c.highlight !== true);
  const partes = [];
  if (entrada.summary) partes.push(`*${entrada.summary}*`);
  if (destacados.length > 0) partes.push(`**⭐ Lo destacado**\n${destacados.map((c) => `• ${c.text}`).join('\n')}`);
  for (const [tipo, etiqueta] of Object.entries(ETIQUETAS_CATEGORIA)) {
    const cambios = resto.filter((c) => c.type === tipo);
    if (cambios.length > 0) partes.push(`**${etiqueta}**\n${cambios.map((c) => `• ${c.text}`).join('\n')}`);
  }
  const ancla = `version-${entrada.version.replace(/[^0-9A-Za-z.-]/g, '-')}`;
  return {
    title: recortar(`v${entrada.version} · ${entrada.title}`, 256),
    url: `${web}/changelog#${ancla}`,
    description: recortar(partes.join('\n\n'), 4096),
    color: color(colorHex),
    timestamp: entrada.date,
    footer: { text: pieVersion(entrada.version) },
  };
}

/** Entradas publicadas que aún no están en el canal (se reconocen por el pie «Versión x»), de la más antigua a la más nueva. */
export function novedadesPendientes(entradas, mensajes) {
  const publicadas = new Set(mensajes.flatMap((m) => (m.embeds ?? []).map((e) => e.footer?.text)).filter(Boolean));
  return entradas
    .filter((e) => e.published && !publicadas.has(pieVersion(e.version)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
