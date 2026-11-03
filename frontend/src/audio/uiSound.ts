import { audio } from './index';

/** Sonidos de interfaz (spec §8). Los ids son los de la tabla de audio. */
export type UiSoundKind = 'confirm' | 'tap' | 'cancel' | 'open' | 'close' | 'tab' | 'tick' | 'error' | 'move';

type UiSoundSink = (kind: UiSoundKind) => void;

const defaultSink: UiSoundSink = (kind) => audio.play(`ui.${kind}`);

// Destino del sonido: el motor de audio; los tests lo cambian con setUiSoundSink (null vuelve al motor).
let sink: UiSoundSink = defaultSink;

export function setUiSoundSink(fn: UiSoundSink | null): void {
  sink = fn ?? defaultSink;
}

export function uiSound(kind: UiSoundKind): void {
  sink(kind);
}
