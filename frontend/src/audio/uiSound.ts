/** Sonidos de interfaz (spec §8). Los ids son los de la tabla de audio. */
export type UiSoundKind = 'confirm' | 'tap' | 'cancel' | 'open' | 'close' | 'tab' | 'tick' | 'error' | 'move';

type UiSoundSink = (kind: UiSoundKind) => void;

// Destino del sonido: en F1 no hay ninguno (lo conecta F2); los tests y F2 lo cambian con setUiSoundSink.
let sink: UiSoundSink | null = null;

export function setUiSoundSink(fn: UiSoundSink | null): void {
  sink = fn;
}

export function uiSound(kind: UiSoundKind): void {
  sink?.(kind);
}
