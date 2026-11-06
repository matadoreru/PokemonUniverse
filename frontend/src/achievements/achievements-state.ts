import type { AchievementUnlock, AchievementsUnlocked, PersonalRecord, RoomPhase } from '@pokemon-universe/shared/public';

/** Fase de la sala, o `NO_ROOM` fuera de ella. */
export type AchievementsPhase = RoomPhase | 'NO_ROOM';

/**
 * Cola en memoria de los logros y récords recién conseguidos (spec §Flujo, punto 6). `shownIn` es la fase en la que se
 * enseñó; `null` mientras espera a una fase sin partida en juego.
 */
export interface AchievementsQueue {
  achievements: AchievementUnlock[];
  records: PersonalRecord[];
  shownIn: AchievementsPhase | null;
}

export const emptyAchievementsQueue: AchievementsQueue = { achievements: [], records: [], shownIn: null };

const recordKey = (record: PersonalRecord) => `${record.gameId}\n${record.key}`;

/**
 * Añade un `achievements:unlocked` sin repetir logros. Un récord del mismo juego y clave se sustituye por el nuevo valor,
 * pero guarda el «antes» del primero: lo que no se ha visto aún es la mejora entera.
 */
export function enqueue(queue: AchievementsQueue, payload: AchievementsUnlocked): AchievementsQueue {
  const ids = new Set(queue.achievements.map((achievement) => achievement.id));
  const achievements = [...queue.achievements];
  for (const achievement of payload.achievements) {
    if (ids.has(achievement.id)) continue;
    ids.add(achievement.id);
    achievements.push(achievement);
  }
  const records = [...queue.records];
  for (const record of payload.records) {
    const index = records.findIndex((current) => recordKey(current) === recordKey(record));
    const existing = index >= 0 ? records[index] : undefined;
    if (existing) records[index] = { ...record, value: Math.max(existing.value, record.value), previous: existing.previous };
    else records.push(record);
  }
  return { ...queue, achievements, records };
}

/** Sin partida en juego: sin sala, en el lobby o en unos resultados. */
export function canShow(phase: AchievementsPhase): boolean {
  return phase === 'NO_ROOM' || phase === 'LOBBY' || phase === 'GAME_RESULTS' || phase === 'SESSION_RESULTS';
}

const isEmpty = (queue: AchievementsQueue) => queue.achievements.length === 0 && queue.records.length === 0;

/**
 * Transición con la fase actual; el proveedor la llama al cambiar de fase y al llegar un aviso. Una cola en espera se
 * enseña en la primera fase que lo permite; una ya enseñada se vacía al pasar a otra fase. Con la misma fase (el doble
 * efecto de `StrictMode`) devuelve la misma cola, así que nunca se pierde un aviso al volver a montar.
 */
export function phaseChanged(queue: AchievementsQueue, phase: AchievementsPhase): AchievementsQueue {
  if (queue.shownIn !== null) return queue.shownIn === phase ? queue : emptyAchievementsQueue;
  if (isEmpty(queue) || !canShow(phase)) return queue;
  return { ...queue, shownIn: phase };
}

/** «Cerrar» o «Ver mis logros»: ya está visto. */
export function acknowledge(): AchievementsQueue {
  return emptyAchievementsQueue;
}

/** Se ve ahora: tiene algo, ya se enseñó y seguimos en esa fase. */
export function isVisible(queue: AchievementsQueue, phase: AchievementsPhase): boolean {
  return !isEmpty(queue) && queue.shownIn === phase;
}

export function noticeTitle(count: number): string {
  return count === 1 ? '¡Logro desbloqueado!' : '¡Logros desbloqueados!';
}

/** Título del aviso; solo con récords, sin logros, habla del récord. */
export function queueTitle(queue: AchievementsQueue): string {
  return queue.achievements.length === 0 ? '¡Nuevo récord personal!' : noticeTitle(queue.achievements.length);
}

/** Cuántos logros se nombran o se pintan a la vez; el resto va en «y N más» (recuadro, aviso flotante y región viva). */
export const MAX_SHOWN = 3;

/** Primeros nombres y «y N más»: con un desbloqueo masivo (cuenta antigua) el texto no se desborda. */
export function namesSummary(achievements: AchievementUnlock[]): string {
  const names = achievements.slice(0, MAX_SHOWN).map((achievement) => achievement.name).join(', ');
  const more = achievements.length - MAX_SHOWN;
  return more > 0 ? `${names} y ${more} más` : names;
}

/** Texto del aviso flotante: los nombres de los logros o, si solo hay récords, sus líneas. */
export function toastText(queue: AchievementsQueue): string {
  if (queue.achievements.length > 0) return namesSummary(queue.achievements);
  return queue.records.map(recordLine).join('. ');
}

export function recordLine(record: PersonalRecord): string {
  return `Nuevo récord personal en ${record.label}: ${record.value} (antes ${record.previous})`;
}

/** Texto de la región viva de los resultados: «Logro desbloqueado: A, B», luego los récords; vacío sin nada. */
export function announcement(queue: AchievementsQueue): string {
  const parts: string[] = [];
  if (queue.achievements.length > 0) parts.push(`Logro desbloqueado: ${namesSummary(queue.achievements)}`);
  for (const record of queue.records) parts.push(recordLine(record));
  return parts.join('. ');
}
