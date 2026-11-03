/**
 * Catálogo de sonidos (spec §8): `data/sfx.json` define cada efecto como una lista de voces chiptune
 * (oscilador o ruido con envolvente, deslizamiento o arpegio, filtro y vibrato). El esquema exige
 * exactamente los ids de `SOUND_IDS`. Portado de Inazuma sin el ambiente ni la música del fútbol.
 */
import { z } from 'zod';
import raw from '../data/sfx.json';

export const SOUND_IDS = [
  'ui.confirm',
  'ui.tap',
  'ui.cancel',
  'ui.move',
  'ui.tab',
  'ui.tick',
  'ui.open',
  'ui.close',
  'ui.error',
  'room.join',
  'room.leave',
  'game.start',
  'game.countdown',
  'game.reveal',
  'game.hit',
  'game.miss',
  'game.score',
  'game.cutin',
  'game.flip',
  'game.clang',
  'game.eliminate',
  'game.bid',
  'game.win',
  'game.podium',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export type Channel = 'music' | 'sfx' | 'ui';

/** Ondas del sintetizador: pulsos al 12,5 y 25 %, cuadrada, triángulo, sierra, seno y ruido. */
export const SFX_WAVES = ['pulse12', 'pulse25', 'square', 'triangle', 'saw', 'sine', 'noise'] as const;
export type SfxWave = (typeof SFX_WAVES)[number];

const Unit = z.number().min(0).max(1);
const Seconds = (max: number) => z.number().min(0).max(max);
const Hz = z.number().positive().max(20000);

/** Una voz: un oscilador (o ruido) con envolvente, deslizamiento o arpegio, filtro y vibrato. */
export const SfxVoiceZ = z
  .strictObject({
    wave: z.enum(SFX_WAVES),
    /** Frecuencia inicial (Hz); con `slide`, la final (rampa exponencial durante hold + decay). */
    freq: Hz.optional(),
    slide: Hz.optional(),
    /** Arpegio: una nota cada `step` segundos (sustituye a `freq`). */
    notes: z.array(Hz).min(1).max(16).optional(),
    step: z.number().positive().max(2).optional(),
    delay: Seconds(5).default(0),
    attack: Seconds(2).default(0.002),
    hold: Seconds(5).default(0),
    decay: Seconds(5).default(0.1),
    gain: Unit,
    filter: z.strictObject({ type: z.enum(['lowpass', 'highpass', 'bandpass']), freq: Hz, q: z.number().positive().max(30).default(1) }).optional(),
    vibrato: z.strictObject({ hz: z.number().positive().max(60), cents: z.number().positive().max(1200) }).optional(),
  })
  .refine((v) => v.wave === 'noise' || v.freq !== undefined || v.notes !== undefined, { message: 'una voz tonal necesita freq o notes' })
  .refine((v) => v.notes === undefined || v.step !== undefined, { message: 'notes necesita step' });

export const SfxSoundZ = z.strictObject({
  $comment: z.string().optional(),
  channel: z.enum(['ui', 'sfx']),
  /** 0 = prescindible (deja dos voces libres), 1 = normal (deja una), 2 = importante (usa todas). */
  priority: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  /** Tiempo mínimo entre dos disparos del mismo efecto (ms); por defecto `limits.defaultCooldownMs`. */
  cooldownMs: z.number().int().min(0).max(5000).optional(),
  voices: z.array(SfxVoiceZ).min(1).max(8),
});

export const SfxFileZ = z.strictObject({
  $comment: z.string().optional(),
  version: z.literal(1),
  /** Volumen relativo de cada canal antes del volumen del usuario. */
  mix: z.strictObject({ music: Unit, sfx: Unit, ui: Unit }),
  limits: z.strictObject({ maxVoices: z.number().int().min(1).max(32), defaultCooldownMs: z.number().int().min(0).max(5000) }),
  /** Variación determinista por disparo: ± cents de tono y ± fracción de ganancia. */
  variation: z.strictObject({ cents: z.number().min(0).max(200), gain: Unit.max(0.5) }),
  /** Fundidos de la música y ganancia mientras suena un grito de Cry Quiz (ducking). */
  music: z.strictObject({ fadeOutSec: Seconds(10), fadeInSec: Seconds(10), duck: Unit }),
  sounds: z.record(z.string(), SfxSoundZ).superRefine((rec, ctx) => {
    for (const id of SOUND_IDS) if (!(id in rec)) ctx.addIssue({ code: 'custom', message: `falta el efecto ${id}` });
    for (const k of Object.keys(rec)) if (!(SOUND_IDS as readonly string[]).includes(k)) ctx.addIssue({ code: 'custom', message: `efecto desconocido ${k}` });
  }),
});

export type SfxVoice = z.infer<typeof SfxVoiceZ>;
export type SfxSound = z.infer<typeof SfxSoundZ>;
export type SfxFile = Omit<z.infer<typeof SfxFileZ>, 'sounds'> & { sounds: Record<SoundId, SfxSound> };

let cached: SfxFile | null = null;

/** Parsea (una vez) el `sfx.json` importado; lanza si el fichero no cumple el esquema. */
export function loadSfx(): SfxFile {
  // El refinamiento garantiza que las claves son exactamente SOUND_IDS.
  cached ??= SfxFileZ.parse(raw) as SfxFile;
  return cached;
}
