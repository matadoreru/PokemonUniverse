import { cx } from './cx';
import s from './UnownGlyph.module.css';

/**
 * Trazos propios de los 26 glifos, inspirados en los Unown: rodean el ojo central (que es igual en todos) y el glifo
 * `i` se basa en la forma de la letra `'A' + i`. La clave de la partida baraja qué glifo es qué letra, así que la
 * forma no delata nada. Todos dejan libre un círculo de radio 9 alrededor del ojo.
 */
const GLYPH_PATHS: readonly string[] = [
  /* A */ 'M7 43 L24 4 L41 43 M14 36 H34',
  /* B */ 'M11 5 V43 M11 5 H24 C39 5 41 19 31 21 C43 23 41 43 24 43 H11',
  /* C */ 'M39 13 A17 17 0 1 0 39 35',
  /* D */ 'M11 5 V43 M11 5 H20 C46 5 46 43 20 43 H11',
  /* E */ 'M39 5 H11 V43 H39 M11 24 H14 M39 5 V11 M39 43 V37',
  /* F */ 'M40 12 Q40 5 33 5 H11 V44 M11 24 H14 M5 44 H17',
  /* G */ 'M39 13 A17 17 0 1 0 41 27 H33 V35',
  /* H */ 'M10 5 V43 M38 5 V43 M10 24 H14 M34 24 H38 M5 5 H15 M33 43 H43',
  /* I */ 'M24 5 V14 M24 34 V43 M15 5 H33 M15 43 H33',
  /* J */ 'M18 5 H40 M34 5 V32 Q34 43 23 43 Q12 43 12 33',
  /* K */ 'M11 5 V43 M40 5 L30 16 M30 32 L40 43 M11 24 H14',
  /* L */ 'M12 5 V43 H38 V36 M12 5 H6',
  /* M */ 'M7 43 V5 L24 14 L41 5 V43',
  /* N */ 'M10 43 V5 L17 13 M31 35 L38 43 V5',
  /* O */ 'M24 5 A19 19 0 1 0 24 43 A19 19 0 1 0 24 5 M24 5 V10 M24 43 V38',
  /* P */ 'M12 44 V5 H22 C44 5 44 35 22 35 H12 M5 44 H19',
  /* Q */ 'M24 5 A18 18 0 1 0 38 35 M33 31 L44 44',
  /* R */ 'M12 44 V5 H22 C44 5 44 33 22 33 H12 M27 34 L39 44',
  /* S */ 'M37 9 C29 3 8 4 9 15 C10 19 13 20 15 21 M33 27 C35 28 39 30 39 34 C40 44 19 45 11 39',
  /* T */ 'M6 7 H42 M24 7 V14 M24 34 V44 M6 7 V13 M42 7 V13',
  /* U */ 'M10 5 V27 A14 14 0 0 0 38 27 V5',
  /* V */ 'M5 5 L24 45 L43 5 M5 5 H11 M43 5 H37',
  /* W */ 'M4 7 L12 42 L24 34 L36 42 L44 7',
  /* X */ 'M7 7 L16 16 M41 7 L32 16 M7 41 L16 32 M41 41 L32 32 M7 7 H13 M41 41 H35',
  /* Y */ 'M7 5 L17 16 M41 5 L31 16 M24 34 V44 M17 44 H31',
  /* Z */ 'M9 7 H39 L31 16 M17 32 L9 41 H39',
];

export type UnownGlyphSize = 'sm' | 'md' | 'lg';

export interface UnownGlyphProps {
  /** Índice del glifo (0–25); fuera de rango no se dibuja nada. */
  glyph: number;
  /** Letra ya descubierta: se muestra debajo y da la etiqueta «letra X». Sin ella, el glifo está oculto. */
  letter?: string;
  size?: UnownGlyphSize;
  className?: string;
}

/** Glifo Unown: un ojo central con trazos gruesos alrededor, en `currentColor` para que valga en los dos temas. */
export function UnownGlyph({ glyph, letter, size = 'md', className }: UnownGlyphProps) {
  if (!Number.isInteger(glyph) || glyph < 0 || glyph >= GLYPH_PATHS.length) return null;
  const known = letter !== undefined && letter !== '';
  return (
    <span className={cx(s.glyph, s[size], className)} data-size={size}>
      <svg className={s.svg} viewBox="0 0 48 48" role="img" aria-label={known ? `letra ${letter}` : 'glifo oculto'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPH_PATHS[glyph]} strokeWidth={4.5} />
        <circle cx={24} cy={24} r={7} strokeWidth={3} />
        <circle cx={24} cy={24} r={3} fill="currentColor" stroke="none" />
      </svg>
      {known && (
        <span className={s.letter} aria-hidden="true">
          {letter}
        </span>
      )}
    </span>
  );
}
