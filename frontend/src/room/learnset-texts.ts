import { gameModeLabel, learnsetManualRevealPoints, learnsetPoints } from '@pokemon-universe/shared/public';
import { secondsLabel } from '../lib/format';

/** Nombre visible de Revelación manual (el del catálogo de modos). */
export const learnsetModeLabel = gameModeLabel('learnset-guess', { mode: 'MANUAL_REVEAL' }) ?? 'Revelación manual';

/**
 * Texto del último aviso de Learnset Guess. `solved` es verdadero para quien ya no tiene que adivinar (ha acertado,
 * observa o no participa): solo el jugador que falta recibe el «Solo faltas tú». `remainingSeconds` son los segundos
 * reales hasta `roundEndsAt` (el mismo reloj que la cabecera); sin segundos que contar, el texto es neutro.
 */
export function learnsetLastWarningText(lastWarning: boolean, solved: boolean, remainingSeconds: number): string | null {
  if (!lastWarning) return null;
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 1) return '¡Último aviso! Se acaba pronto.';
  const seconds = Math.ceil(remainingSeconds);
  return solved ? `Último aviso: la ronda se cierra en ${secondsLabel(seconds)}.` : `¡Último aviso! Solo faltas tú: ${secondsLabel(seconds)}.`;
}

/**
 * El último aviso para lectores de pantalla: un texto fijo (sin la cuenta atrás, que cambia cada segundo y se volvería
 * a anunciar), que se lee una vez al empezar el aviso.
 */
export function learnsetLastWarningAnnouncement(lastWarning: boolean, solved: boolean): string | null {
  if (!lastWarning) return null;
  return solved ? 'Último aviso: la ronda se cierra en unos segundos.' : '¡Último aviso! Solo faltas tú: la ronda se cierra en unos segundos.';
}

/**
 * Lo que vale ahora un acierto, con la misma cuenta que el motor (`learnsetPoints(revealStage, solveOrder)`):
 * la etapa del motor (`revealedExtraGroups`) es la más alta de los grupos visibles, y el siguiente en acertar
 * tendrá el orden `solvedCount + 1`.
 */
export function learnsetStakeText(visibleGroups: readonly { stage: number }[], solvedCount: number): string {
  const stage = Math.max(0, ...visibleGroups.map((group) => group.stage));
  const points = learnsetPoints(stage, solvedCount + 1);
  return `Ahora vale ${points} ${points === 1 ? 'pt' : 'pts'}`;
}

/** Revelación manual: lo que vale ahora un acierto con `visibleGroups` de `totalGroups` grupos a la vista. */
export function learnsetManualStakeText(totalGroups: number, visibleGroups: number): string {
  const points = learnsetManualRevealPoints(totalGroups, visibleGroups);
  return `Ahora vale ${points} ${points === 1 ? 'pt' : 'pts'}`;
}

/** Revelación manual: «N de M grupos» desbloqueados. */
export function learnsetGroupProgress(visibleGroups: number, totalGroups: number): string {
  return `${visibleGroups} de ${totalGroups} ${totalGroups === 1 ? 'grupo' : 'grupos'}`;
}

/**
 * Cómo acaba cada jugador en la revelación. `connected` es si estaba presente al cerrar la ronda (no está en
 * `lastRound.absentIds`, la misma regla con la que el motor suma `missed`): quien no acertó y no lo estaba sale
 * «Sin conexión», no como fallo.
 */
export function learnsetRevealStatus(solved: boolean, connected: boolean): 'solved' | 'missed' | 'offline' {
  if (solved) return 'solved';
  return connected ? 'missed' : 'offline';
}

/** Aviso para los demás cuando alguien acierta (sin decir qué Pokémon era). */
export function learnsetSolvedAnnouncement(name: string): string {
  return `${name} ha acertado`;
}

/** Marcador en vivo: solo jugadores (no espectadores), por puntos y después por nombre. */
export function learnsetScoreboard<M extends { id: string; displayName: string; role: string }>(members: readonly M[], scores: Readonly<Record<string, number>>): Array<{ member: M; points: number }> {
  return members
    .filter((member) => member.role !== 'SPECTATOR')
    .map((member) => ({ member, points: scores[member.id] ?? 0 }))
    .sort((left, right) => right.points - left.points || left.member.displayName.localeCompare(right.member.displayName));
}
