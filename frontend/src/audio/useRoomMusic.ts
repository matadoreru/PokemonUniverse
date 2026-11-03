/**
 * Música de la sala (spec §8): traduce la fase de la sala al tema que toca (`musicTrackFor`) y lo
 * pide al audio; al salir de la sala, silencio. El cambio de tema solo ocurre cuando cambia el tema,
 * no en cada fase interna del juego.
 */
import type { RoomPhase } from '@pokemon-universe/shared/public';
import { useEffect } from 'react';
import { audio } from './index';
import { musicTrackFor } from './music';

export function useRoomMusic(phase: RoomPhase | null | undefined): void {
  const track = musicTrackFor(phase);
  useEffect(() => { audio.music.play(track); }, [track]);
  useEffect(() => () => { audio.music.play(null); }, []);
}
