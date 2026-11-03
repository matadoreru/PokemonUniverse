/**
 * Música propia de la sala (spec §8): tres temas chiptune compuestos por código para este proyecto,
 * sin citar melodías de Pokémon ni de ningún otro juego. `lobby` (vestíbulo y votación del siguiente
 * juego) es alegre, en Do mayor a 120 bpm y 16 compases; `game` (durante el juego) es más tenso, en
 * La menor a 140 bpm; `results` es una fanfarria corta en Do mayor que suena una vez.
 * Notación de `tracker.ts`: una nota por paso, `-` alarga, `.` silencio; batería k/s/h/o.
 */
import type { MusicTrack } from '../engine';
import type { Song, TrackDef } from './tracker';

type Env = TrackDef['env'];
const PLUCK: Env = [0.005, 0.08, 0.5, 0.06];
const LEAD: Env = [0.005, 0.06, 0.65, 0.08];
const BASS: Env = [0.005, 0.05, 0.85, 0.04];
const BELL: Env = [0.003, 0.12, 0.45, 0.25];

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' | ');
const bars = (...b: string[]) => b.join(' | ');
/** Arpegio de corcheas sobre un acorde: raíz, tercera, quinta, tercera, octava, quinta, tercera, quinta. */
const arp8 = (a: string, b: string, c: string, d: string) => `${a} ${b} ${c} ${b} ${d} ${c} ${b} ${c}`;
/** Arpegio de semicorcheas que sube y baja. */
const arp16 = (a: string, b: string, c: string, d: string) => rep(`${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b}`, 2);
/** Bajo saltarín: raíz, quinta y una nota de paso. */
const hop8 = (r: string, f: string, o: string) => `${r} . ${f} . ${o} . ${f} .`;
/** Bajo de corcheas continuas con salto de octava. */
const drive8 = (r: string, o: string) => `${r} ${r} ${o} ${r} ${r} ${o} ${r} ${o}`;

// ---------------------------------------------------------------- lobby: Do mayor, 120 bpm, 16 compases

const LOBBY_BEAT = 'k . h . s . h k . k h . s . h .';
const LOBBY_FILL = 'k . h . s . h . k . s . s s s s';

const lobby: Song = {
  bpm: 120,
  bars: 16,
  loop: true,
  tracks: [
    {
      wave: 'pulse25', gain: 0.18, env: LEAD, steps: 8,
      pattern: bars(
        // A: C · Am · F · G · C · Em · F · G
        'E5 - G5 E5 C5 - D5 E5', 'C5 - A4 - . A4 C5 E5', 'F5 - E5 F5 A5 - G5 F5', 'D5 - - - G4 - B4 D5',
        'E5 - G5 E5 C6 - B5 A5', 'G5 - E5 - B4 - E5 G5', 'A5 - G5 F5 E5 - D5 C5', 'D5 - - - - - . .',
        // B: F · G · Em · Am · Dm · G · C · G
        'A4 - C5 F5 - E5 F5 A5', 'G5 - D5 - B4 - D5 G5', 'E5 - B4 E5 G5 - A5 G5', 'A5 - - - E5 - C5 A4',
        'D5 - F5 - A5 - G5 F5', 'B4 - D5 - G5 - F5 D5', 'E5 G5 C6 - G5 - E5 G5', 'D5 - B4 - G4 - . .',
      ),
    },
    {
      wave: 'pulse12', gain: 0.07, env: PLUCK, steps: 8,
      pattern: bars(
        arp8('C4', 'E4', 'G4', 'C5'), arp8('A3', 'C4', 'E4', 'A4'), arp8('F3', 'A3', 'C4', 'F4'), arp8('G3', 'B3', 'D4', 'G4'),
        arp8('C4', 'E4', 'G4', 'C5'), arp8('E3', 'G3', 'B3', 'E4'), arp8('F3', 'A3', 'C4', 'F4'), arp8('G3', 'B3', 'D4', 'G4'),
        arp8('F3', 'A3', 'C4', 'F4'), arp8('G3', 'B3', 'D4', 'G4'), arp8('E3', 'G3', 'B3', 'E4'), arp8('A3', 'C4', 'E4', 'A4'),
        arp8('D4', 'F4', 'A4', 'D5'), arp8('G3', 'B3', 'D4', 'G4'), arp8('C4', 'E4', 'G4', 'C5'), arp8('G3', 'B3', 'D4', 'G4'),
      ),
    },
    {
      wave: 'triangle', gain: 0.24, env: BASS, steps: 8,
      pattern: bars(
        hop8('C3', 'G2', 'E3'), hop8('A2', 'E3', 'C3'), hop8('F2', 'C3', 'A2'), hop8('G2', 'D3', 'B2'),
        hop8('C3', 'G2', 'E3'), hop8('E2', 'B2', 'G2'), hop8('F2', 'C3', 'A2'), hop8('G2', 'D3', 'B2'),
        hop8('F2', 'C3', 'A2'), hop8('G2', 'D3', 'B2'), hop8('E2', 'B2', 'G2'), hop8('A2', 'E3', 'C3'),
        hop8('D3', 'A2', 'F2'), hop8('G2', 'D3', 'B2'), hop8('C3', 'G2', 'E3'), 'G2 . G2 . A2 . B2 .',
      ),
    },
    { wave: 'drums', gain: 0.22, env: PLUCK, steps: 16, pattern: bars(rep(LOBBY_BEAT, 7), LOBBY_FILL, rep(LOBBY_BEAT, 7), LOBBY_FILL) },
  ],
};

// ---------------------------------------------------------------- game: La menor, 140 bpm, 16 compases

const GAME_BEAT = 'k . h k s . h . k k h . s . h h';
const GAME_FILL = 'k . s . s . k . s s s . s s s s';

const game: Song = {
  bpm: 140,
  bars: 16,
  loop: true,
  tracks: [
    {
      wave: 'pulse25', gain: 0.17, env: LEAD, steps: 8,
      pattern: bars(
        // A: Am · F · G · E · Am · F · G · E
        'A4 . A4 C5 . E5 D5 C5', 'F5 . F5 E5 . C5 A4 C5', 'D5 . D5 B4 . G4 B4 D5', 'E5 - - . G#4 - B4 -',
        'A5 . A5 G5 . E5 G5 A5', 'C6 . A5 F5 . A5 G5 F5', 'G5 . D5 B4 . D5 F5 D5', 'E5 - - - - - . .',
        // B: Dm · Am · Dm · E · F · G · E · E
        'D5 F5 A5 F5 D5 F5 A5 C6', 'C6 - B5 A5 - E5 - .', 'D5 F5 A5 D6 - C6 A5 F5', 'G#5 - B5 - E5 - G#5 -',
        'A5 - C6 - F5 - A5 -', 'B5 - D6 - G5 - B5 -', 'E5 G#5 B5 E6 - B5 G#5 E5', 'E5 - . . E4 . E4 .',
      ),
    },
    {
      wave: 'pulse12', gain: 0.06, env: PLUCK, steps: 16,
      pattern: bars(
        arp16('A3', 'C4', 'E4', 'A4'), arp16('F3', 'A3', 'C4', 'F4'), arp16('G3', 'B3', 'D4', 'G4'), arp16('E3', 'G#3', 'B3', 'E4'),
        arp16('A3', 'C4', 'E4', 'A4'), arp16('F3', 'A3', 'C4', 'F4'), arp16('G3', 'B3', 'D4', 'G4'), arp16('E3', 'G#3', 'B3', 'E4'),
        arp16('D4', 'F4', 'A4', 'D5'), arp16('A3', 'C4', 'E4', 'A4'), arp16('D4', 'F4', 'A4', 'D5'), arp16('E3', 'G#3', 'B3', 'E4'),
        arp16('F3', 'A3', 'C4', 'F4'), arp16('G3', 'B3', 'D4', 'G4'), arp16('E3', 'G#3', 'B3', 'E4'), arp16('E3', 'G#3', 'B3', 'E4'),
      ),
    },
    {
      wave: 'triangle', gain: 0.25, env: BASS, steps: 8,
      pattern: bars(
        drive8('A2', 'A3'), drive8('F2', 'F3'), drive8('G2', 'G3'), drive8('E2', 'E3'),
        drive8('A2', 'A3'), drive8('F2', 'F3'), drive8('G2', 'G3'), drive8('E2', 'E3'),
        drive8('D2', 'D3'), drive8('A2', 'A3'), drive8('D2', 'D3'), drive8('E2', 'E3'),
        drive8('F2', 'F3'), drive8('G2', 'G3'), drive8('E2', 'E3'), 'E2 E2 . . E2 . E2 .',
      ),
    },
    { wave: 'drums', gain: 0.24, env: PLUCK, steps: 16, pattern: bars(rep(GAME_BEAT, 7), GAME_FILL, rep(GAME_BEAT, 7), GAME_FILL) },
  ],
};

// ---------------------------------------------------------------- results: fanfarria en Do mayor, 4 compases

const results: Song = {
  bpm: 132,
  bars: 4,
  loop: false,
  tracks: [
    // C · F · G · C
    { wave: 'pulse25', gain: 0.2, env: LEAD, steps: 8, pattern: bars('C5 . C5 . C5 E5 G5 -', 'A5 - F5 - A5 - C6 -', 'B5 - G5 - D6 - B5 -', 'C6 - - - - - - -') },
    { wave: 'pulse12', gain: 0.1, env: BELL, steps: 8, pattern: bars('E4 . E4 . E4 G4 C5 -', 'C5 - A4 - C5 - F5 -', 'D5 - B4 - G5 - D5 -', 'E5 - - - - - - -') },
    { wave: 'triangle', gain: 0.24, env: BASS, steps: 8, pattern: bars('C3 . C3 . C3 . G2 .', 'F2 . F2 . A2 . C3 .', 'G2 . G2 . B2 . D3 .', 'C3 - - - - - - -') },
    { wave: 'drums', gain: 0.24, env: PLUCK, steps: 16, pattern: bars('k . . . k . . . k . s . s . s s', 'k . h . s . h . k . h . s . s .', 'k . h . s . h . k . s s s s s s', 'k . . . . . . . . . . . . . . .') },
  ],
};

export const SONGS: Record<MusicTrack, Song> = { lobby, game, results };
