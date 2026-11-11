import type { PokemonCryVersion } from '@pokemon-universe/shared/public';
import { audio } from '../../audio';

/** Texto de la versión del grito de la ronda. */
export function cryVersionLabel(version: PokemonCryVersion): string {
  return version === 'LEGACY' ? 'grito clásico' : 'grito actual';
}

export const CRY_UNAVAILABLE = 'El grito no está disponible temporalmente.';
export const CRY_PLAY_FAILED = 'No se pudo reproducir el audio. Comprueba el volumen o vuelve a intentarlo.';

/**
 * Manejadores del `<audio>` del grito (F2, spec §8): la música de la sala baja mientras suena y vuelve al pararse,
 * terminar o fallar. El estado «Sonando…» sale de los eventos reales del elemento, no de la pulsación.
 */
export function cryAudioEvents(set: { playing(on: boolean): void; error(message: string): void }) {
  return {
    onPlay: () => { audio.music.duck(true); set.playing(true); },
    onPause: () => { audio.music.duck(false); set.playing(false); },
    onEnded: () => { audio.music.duck(false); set.playing(false); },
    onError: () => { audio.music.duck(false); set.playing(false); set.error(CRY_UNAVAILABLE); },
  };
}

/**
 * Texto de la única región viva de la pantalla: el aviso de la ronda y, si el grito no suena, el porqué (el error se ve
 * junto al botón, sin región propia).
 */
export function cryAnnouncement(round: string, audioError: string): string {
  return [round, audioError].filter(Boolean).join(' ');
}

/** Al cambiar de grito o desmontar (sin un `pause` fiable), la música vuelve a su volumen. */
export function releaseCryDuck(): void {
  audio.music.duck(false);
}
