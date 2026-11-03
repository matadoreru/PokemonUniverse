/**
 * Mezcla (spec §8), portada de Inazuma: ganancia efectiva de cada canal = volumen general × volumen
 * del canal (curva cuadrática) × mezcla relativa de `sfx.json → mix`; con silencio todo es 0. Las
 * rampas se programan sobre un `AudioParam`, nunca a saltos, para evitar chasquidos.
 */
import type { Channel } from './catalog';
import { stepGain, type AudioSettings } from './settings';
import type { AudioParamLike } from './synth';

export type ChannelMix = Record<Channel, number>;

export function channelGain(a: AudioSettings, channel: Channel, mix: ChannelMix): number {
  if (a.muted) return 0;
  return stepGain(a.master) * stepGain(a[channel]) * mix[channel];
}

/** Ganancias de los tres canales para unos ajustes. */
export function channelGains(a: AudioSettings, mix: ChannelMix): ChannelMix {
  return { music: channelGain(a, 'music', mix), sfx: channelGain(a, 'sfx', mix), ui: channelGain(a, 'ui', mix) };
}

/** Rampa lineal desde el valor actual hasta `target` en `seconds` (0 = al instante). */
export function rampTo(p: AudioParamLike, target: number, now: number, seconds: number): void {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  if (seconds <= 0) p.setValueAtTime(target, now);
  else p.linearRampToValueAtTime(target, now + seconds);
}
